import "server-only";

import type { NotificationSeverity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addDays, dateKeyIST, endOfDayIST, startOfDayIST, todayDateOnly } from "@/lib/dates";
import { daysLeftLabel, documentState } from "@/lib/documents";
import { formatRegistration, serviceHealth } from "@/lib/fleet";
import { getSettings, reminderDaysFor } from "@/lib/settings";
import { formatMoney, formatShortDateTime, round2, toNum } from "@/lib/utils";

const SYNC_KEY = "system.notificationsSyncedAt";
const SYNC_EVERY_MS = 10 * 60 * 1000;

type Draft = {
  type: string;
  title: string;
  message: string;
  link: string;
  severity: NotificationSeverity;
  entity: string;
  entityId: number;
  dedupeKey: string;
};

/** Types that describe a booking state; they are cleared once the booking moves on. */
const BOOKING_TYPES = ["return-today", "overdue", "pickup", "payment-due"];

export async function syncNotifications({ force = false } = {}) {
  const now = new Date();
  const last = await prisma.setting.findUnique({ where: { key: SYNC_KEY } });
  if (!force && last && now.getTime() - Number(last.value) < SYNC_EVERY_MS) return;

  await prisma.setting.upsert({
    where: { key: SYNC_KEY },
    create: { key: SYNC_KEY, value: String(now.getTime()), group: "system", valueType: "number", label: "Last notification sync" },
    update: { value: String(now.getTime()) },
  });

  const settings = await getSettings();
  const today = todayDateOnly();
  const todayKey = dateKeyIST(now);
  const drafts: Draft[] = [];

  const [running, upcoming, unpaid, carDocs, licences, cars] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ["RUNNING", "HANDED_OVER"] }, returnAt: { lte: endOfDayIST(now) } },
      include: { customer: { select: { fullName: true } }, car: { select: { registrationNumber: true, model: true } } },
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        pickupAt: { gte: startOfDayIST(now), lte: endOfDayIST(addDays(now, settings.reminders.bookingDays)) },
      },
      include: { customer: { select: { fullName: true } }, car: { select: { registrationNumber: true, model: true } } },
    }),
    prisma.booking.findMany({
      where: { status: "RETURNED" },
      include: { customer: { select: { fullName: true } } },
    }),
    prisma.carDocument.findMany({
      where: { expiryDate: { not: null, lte: addDays(today, 60) }, car: { status: { not: "INACTIVE" } } },
      include: { car: { select: { id: true, registrationNumber: true } } },
    }),
    prisma.customer.findMany({
      where: {
        status: "ACTIVE",
        licenseExpiry: { not: null, lte: addDays(today, settings.reminders.licenceDays) },
        bookings: { some: { status: { in: ["CONFIRMED", "RUNNING", "HANDED_OVER"] } } },
      },
      select: { id: true, fullName: true, licenseExpiry: true },
    }),
    prisma.car.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { id: true, registrationNumber: true, model: true, currentKm: true, serviceDueKm: true, nextServiceDate: true },
    }),
  ]);

  for (const b of running) {
    const reg = formatRegistration(b.car.registrationNumber);
    if (b.returnAt < now) {
      drafts.push({
        type: "overdue",
        title: `Overdue: ${b.car.model} ${reg}`,
        message: `${b.customer.fullName} was due back ${formatShortDateTime(b.returnAt)} (${b.bookingNumber}).`,
        link: `/bookings/${b.id}`,
        severity: "URGENT",
        entity: "Booking",
        entityId: b.id,
        dedupeKey: `overdue:${b.id}:${todayKey}`,
      });
    } else {
      drafts.push({
        type: "return-today",
        title: `Returning today: ${b.car.model} ${reg}`,
        message: `${b.customer.fullName} · due ${formatShortDateTime(b.returnAt)} (${b.bookingNumber}).`,
        link: `/bookings/${b.id}`,
        severity: "INFO",
        entity: "Booking",
        entityId: b.id,
        dedupeKey: `return-today:${b.id}:${todayKey}`,
      });
    }
  }

  for (const b of upcoming) {
    const isToday = dateKeyIST(b.pickupAt) === todayKey;
    drafts.push({
      type: "pickup",
      title: `${isToday ? "Pickup today" : "Upcoming pickup"}: ${b.car.model} ${formatRegistration(b.car.registrationNumber)}`,
      message: `${b.customer.fullName} · ${formatShortDateTime(b.pickupAt)} (${b.bookingNumber}).`,
      link: `/bookings/${b.id}`,
      severity: isToday ? "WARNING" : "INFO",
      entity: "Booking",
      entityId: b.id,
      dedupeKey: `pickup:${b.id}:${isToday ? "today" : "soon"}`,
    });
  }

  for (const b of unpaid) {
    const due = round2(toNum(b.totalAmount) - toNum(b.paidAmount));
    if (due <= 0.009) continue;
    drafts.push({
      type: "payment-due",
      title: `Payment pending: ${formatMoney(due)}`,
      message: `${b.customer.fullName} still owes ${formatMoney(due)} on ${b.bookingNumber}.`,
      link: `/bookings/${b.id}`,
      severity: "WARNING",
      entity: "Booking",
      entityId: b.id,
      dedupeKey: `payment-due:${b.id}`,
    });
  }

  for (const d of carDocs) {
    const { state, daysLeft } = documentState(d.expiryDate, today, reminderDaysFor(d.documentType, settings));
    if (state === "VALID" || state === "NA") continue;
    drafts.push({
      type: "document",
      title: `${d.documentType} ${state === "EXPIRED" ? "expired" : "expiring"}: ${formatRegistration(d.car.registrationNumber)}`,
      message: `${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""} ${state === "EXPIRED" ? "expired" : "expires"} ${daysLeftLabel(daysLeft)}.`,
      link: `/cars/${d.car.id}?tab=documents`,
      severity: state === "EXPIRING_SOON" ? "WARNING" : "URGENT",
      entity: "CarDocument",
      entityId: d.id,
      dedupeKey: `doc:${d.id}:${state}:${d.expiryDate?.toISOString().slice(0, 10)}`,
    });
  }

  for (const c of licences) {
    const { state, daysLeft } = documentState(c.licenseExpiry, today, settings.reminders.licenceDays);
    if (state === "VALID" || state === "NA") continue;
    drafts.push({
      type: "licence",
      title: `Licence ${state === "EXPIRED" ? "expired" : "expiring"}: ${c.fullName}`,
      message: `Driving licence ${state === "EXPIRED" ? "expired" : "expires"} ${daysLeftLabel(daysLeft)} — they have an active booking.`,
      link: `/customers/${c.id}`,
      severity: state === "EXPIRING_SOON" ? "WARNING" : "URGENT",
      entity: "Customer",
      entityId: c.id,
      dedupeKey: `licence:${c.id}:${state}:${c.licenseExpiry?.toISOString().slice(0, 10)}`,
    });
  }

  for (const car of cars) {
    const health = serviceHealth(car, today, { km: settings.reminders.serviceKm, days: settings.reminders.serviceDays });
    if (health.state !== "due" && health.state !== "overdue") continue;
    const detail = [
      health.kmLeft !== null ? (health.kmLeft >= 0 ? `${health.kmLeft} km left` : `${-health.kmLeft} km over`) : null,
      health.daysLeft !== null ? daysLeftLabel(health.daysLeft) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    drafts.push({
      type: "service",
      title: `${health.label}: ${car.model} ${formatRegistration(car.registrationNumber)}`,
      message: detail,
      link: `/cars/${car.id}?tab=maintenance`,
      severity: health.state === "overdue" ? "URGENT" : "WARNING",
      entity: "Car",
      entityId: car.id,
      dedupeKey: `service:${car.id}:${health.state}:${car.serviceDueKm ?? ""}:${car.nextServiceDate?.toISOString().slice(0, 10) ?? ""}`,
    });
  }

  if (drafts.length > 0) {
    await prisma.notification.createMany({ data: drafts, skipDuplicates: true });
  }

  // Clear booking alerts whose booking has moved on (returned, paid, cancelled…).
  const stillValid = new Set(drafts.filter((d) => BOOKING_TYPES.includes(d.type)).map((d) => d.dedupeKey));
  const stale = await prisma.notification.findMany({
    where: { readAt: null, type: { in: BOOKING_TYPES } },
    select: { id: true, dedupeKey: true },
  });
  const staleIds = stale.filter((n) => !n.dedupeKey || !stillValid.has(n.dedupeKey)).map((n) => n.id);
  if (staleIds.length > 0) {
    await prisma.notification.updateMany({ where: { id: { in: staleIds } }, data: { readAt: now } });
  }
}

export function unreadCount() {
  return prisma.notification.count({ where: { readAt: null } });
}
