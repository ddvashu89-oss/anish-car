import { daysBetweenDateOnly } from "@/lib/dates";
import type { Tone } from "@/lib/status";

type BookingSpan = {
  status: string;
  pickupAt: Date;
  returnAt: Date;
  actualPickupAt: Date | null;
  actualReturnAt: Date | null;
};

const COUNTED = new Set(["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED"]);

/** Time actually on rent where known, otherwise the booked window. */
function span(b: BookingSpan, now: Date) {
  const start = b.actualPickupAt ?? b.pickupAt;
  const end = b.actualReturnAt ?? (b.status === "RUNNING" ? new Date(Math.max(now.getTime(), b.returnAt.getTime())) : b.returnAt);
  return [start.getTime(), end.getTime()] as const;
}

/** Share of the period the car was out on rent (0–100). */
export function utilization(bookings: BookingSpan[], from: Date, to: Date, now = new Date()) {
  const periodEnd = Math.min(to.getTime(), now.getTime());
  const periodStart = from.getTime();
  const total = periodEnd - periodStart;
  if (total <= 0) return 0;

  // Merge overlapping spans so double-counted time can't push past 100%.
  const spans = bookings
    .filter((b) => COUNTED.has(b.status))
    .map((b) => span(b, now))
    .map(([s, e]) => [Math.max(s, periodStart), Math.min(e, periodEnd)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let used = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) used += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  if (curEnd > curStart) used += curEnd - curStart;

  return Math.min(100, Math.round((used / total) * 100));
}

export type ServiceHealth = {
  state: "ok" | "due" | "overdue" | "unknown";
  label: string;
  tone: Tone;
  kmLeft: number | null;
  daysLeft: number | null;
};

export function serviceHealth(
  car: { currentKm: number; serviceDueKm: number | null; nextServiceDate: Date | null },
  today: Date,
  thresholds: { km: number; days: number },
): ServiceHealth {
  const kmLeft = car.serviceDueKm != null ? car.serviceDueKm - car.currentKm : null;
  const daysLeft = car.nextServiceDate ? daysBetweenDateOnly(today, car.nextServiceDate) : null;

  if (kmLeft === null && daysLeft === null) {
    return { state: "unknown", label: "No service schedule", tone: "neutral", kmLeft, daysLeft };
  }
  if ((kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0)) {
    return { state: "overdue", label: "Service overdue", tone: "danger", kmLeft, daysLeft };
  }
  if ((kmLeft !== null && kmLeft <= thresholds.km) || (daysLeft !== null && daysLeft <= thresholds.days)) {
    return { state: "due", label: "Service due soon", tone: "warning", kmLeft, daysLeft };
  }
  return { state: "ok", label: "Healthy", tone: "success", kmLeft, daysLeft };
}

/** "HR 26 ab-1234" → "HR26AB1234" so searches match however the number was typed. */
export function normalizeRegistration(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "HR26AB1234" → "HR 26 AB 1234" for display. */
export function formatRegistration(value: string) {
  const m = value.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!m) return value;
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ");
}
