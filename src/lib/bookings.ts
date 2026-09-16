import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { RateRuleInput } from "@/lib/billing";
import { round2, toNum } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

/** Statuses that hold a car for their dates. */
export const HOLDING_STATUSES: BookingStatus[] = ["CONFIRMED", "HANDED_OVER", "RUNNING"];

/**
 * Bookings that count toward money owed. Drafts and quotations are not commitments yet.
 * Cancelling a booking resets its total to the cancellation fee (usually 0), so a cancelled
 * booking only ever contributes that fee — and any advance paid shows up as a credit to refund.
 */
export const BILLABLE_STATUSES: BookingStatus[] = ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED", "CANCELLED"];

/** Payment types that are rental revenue. Security deposits are held money, not income. */
export const REVENUE_PAYMENT_TYPES = ["ADVANCE", "PARTIAL", "FINAL", "PENALTY", "OTHER"] as const;

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; tone: "neutral" | "info" | "primary" | "warning" | "success" | "danger" }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  QUOTATION: { label: "Quotation", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  HANDED_OVER: { label: "Handed over", tone: "primary" },
  RUNNING: { label: "Running", tone: "primary" },
  RETURNED: { label: "Returned", tone: "warning" },
  CLOSED: { label: "Closed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

/**
 * A car is blocked for [from, to) when a holding booking overlaps it. A running rental
 * that is already overdue keeps blocking until the car is actually returned.
 */
function conflictWhere(carId: number, from: Date, to: Date, excludeBookingId?: number): Prisma.BookingWhereInput {
  const now = new Date();
  return {
    carId,
    ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    OR: [
      { status: { in: ["CONFIRMED", "HANDED_OVER"] }, pickupAt: { lt: to }, returnAt: { gt: from } },
      {
        status: "RUNNING",
        pickupAt: { lt: to },
        OR: [{ returnAt: { gt: from } }, { returnAt: { lt: now } }],
      },
    ],
  };
}

export async function findConflicts(
  carId: number,
  from: Date,
  to: Date,
  excludeBookingId?: number,
  client: Tx | typeof prisma = prisma,
) {
  return client.booking.findMany({
    where: conflictWhere(carId, from, to, excludeBookingId),
    select: { id: true, bookingNumber: true, pickupAt: true, returnAt: true, status: true },
    orderBy: { pickupAt: "asc" },
  });
}

export type CarAvailability = {
  id: number;
  registrationNumber: string;
  company: string;
  model: string;
  variant: string | null;
  fuelType: string;
  transmission: string;
  seatingCapacity: number | null;
  status: string;
  dailyRate: number;
  includedKmPerDay: number;
  extraKmRate: number;
  securityDeposit: number;
  currentKm: number;
  available: boolean;
  reason: string | null;
};

export async function carAvailability(from: Date, to: Date, excludeBookingId?: number): Promise<CarAvailability[]> {
  const now = new Date();
  const [cars, blocking] = await Promise.all([
    prisma.car.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: [{ company: "asc" }, { model: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        OR: [
          { status: { in: ["CONFIRMED", "HANDED_OVER"] }, pickupAt: { lt: to }, returnAt: { gt: from } },
          { status: "RUNNING", pickupAt: { lt: to }, OR: [{ returnAt: { gt: from } }, { returnAt: { lt: now } }] },
        ],
      },
      select: { carId: true, bookingNumber: true },
    }),
  ]);

  const blockedBy = new Map<number, string>();
  for (const b of blocking) if (!blockedBy.has(b.carId)) blockedBy.set(b.carId, b.bookingNumber);

  return cars.map((car) => {
    let reason: string | null = null;
    if (car.status === "SERVICE") reason = "In service";
    else if (blockedBy.has(car.id)) reason = `Booked (${blockedBy.get(car.id)})`;
    return {
      id: car.id,
      registrationNumber: car.registrationNumber,
      company: car.company,
      model: car.model,
      variant: car.variant,
      fuelType: car.fuelType,
      transmission: car.transmission,
      seatingCapacity: car.seatingCapacity,
      status: car.status,
      dailyRate: toNum(car.dailyRate),
      includedKmPerDay: car.includedKmPerDay,
      extraKmRate: toNum(car.extraKmRate),
      securityDeposit: toNum(car.securityDeposit),
      currentKm: car.currentKm,
      available: reason === null,
      reason,
    };
  });
}

export async function loadRateRules(): Promise<RateRuleInput[]> {
  const rules = await prisma.rateRule.findMany({ where: { isActive: true } });
  return rules.map((r) => ({
    id: r.id,
    carId: r.carId,
    kind: r.kind,
    label: r.label,
    minDays: r.minDays,
    maxDays: r.maxDays,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    dailyRate: toNum(r.dailyRate),
    priority: r.priority,
    isActive: r.isActive,
  }));
}

/**
 * Recomputes a booking's cached money columns from the payment and refund ledgers.
 * Call inside the same transaction as any payment/refund change.
 */
export async function syncBookingMoney(tx: Tx, bookingId: number) {
  const [revenue, refunds] = await Promise.all([
    tx.payment.aggregate({
      _sum: { amount: true },
      where: { bookingId, status: "SUCCESS", paymentType: { in: [...REVENUE_PAYMENT_TYPES] } },
    }),
    tx.refund.groupBy({
      by: ["kind"],
      _sum: { amount: true },
      where: { bookingId },
    }),
  ]);

  const paymentRefunds = toNum(refunds.find((r) => r.kind === "PAYMENT")?._sum.amount);
  const depositRefunds = toNum(refunds.find((r) => r.kind === "DEPOSIT")?._sum.amount);

  const paid = round2(toNum(revenue._sum.amount) - paymentRefunds);
  const booking = await tx.booking.update({
    where: { id: bookingId },
    data: { paidAmount: paid, depositRefunded: round2(depositRefunds) },
    select: { totalAmount: true },
  });

  // Invoices mirror the booking; keep their paid figure and status current.
  const total = toNum(booking.totalAmount);
  await tx.invoice.updateMany({
    where: { bookingId, status: { not: "CANCELLED" } },
    data: {
      paidAmount: paid,
      status: paid + 0.009 >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
    },
  });
}

/** Deposit collected minus deposit already refunded or adjusted. */
export async function depositHeld(bookingId: number, client: Tx | typeof prisma = prisma) {
  const [collected, refunded] = await Promise.all([
    client.payment.aggregate({
      _sum: { amount: true },
      where: { bookingId, status: "SUCCESS", paymentType: "SECURITY_DEPOSIT" },
    }),
    client.refund.aggregate({ _sum: { amount: true }, where: { bookingId, kind: "DEPOSIT" } }),
  ]);
  return {
    collected: toNum(collected._sum.amount),
    refunded: toNum(refunded._sum.amount),
    held: round2(toNum(collected._sum.amount) - toNum(refunded._sum.amount)),
  };
}

export function balanceDue(booking: { totalAmount: unknown; paidAmount: unknown }) {
  return round2(toNum(booking.totalAmount as number) - toNum(booking.paidAmount as number));
}

export async function logStatus(
  tx: Tx,
  bookingId: number,
  from: BookingStatus | null,
  to: BookingStatus,
  userId: number,
  note?: string,
) {
  await tx.bookingStatusHistory.create({
    data: { bookingId, fromStatus: from, toStatus: to, changedById: userId, note: note?.slice(0, 255) },
  });
}
