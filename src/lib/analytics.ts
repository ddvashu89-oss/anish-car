import "server-only";

import { prisma } from "@/lib/db";
import { REVENUE_PAYMENT_TYPES } from "@/lib/bookings";
import {
  dateKeyIST,
  endOfDayIST,
  endOfMonthIST,
  monthKeyIST,
  parseDateInput,
  startOfDayIST,
  startOfMonthIST,
} from "@/lib/dates";
import { utilization } from "@/lib/fleet";
import { round2, toNum } from "@/lib/utils";

export type Period = { key: string; label: string; from: Date; to: Date; fromKey: string; toKey: string };

export const PERIOD_PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "this-year", label: "This year" },
] as const;

export function resolvePeriod(key: string | undefined, fromStr?: string, toStr?: string): Period {
  const now = new Date();
  const custom = fromStr && toStr ? { from: parseDateInput(fromStr), to: parseDateInput(toStr) } : null;
  if (custom?.from && custom.to && custom.to >= custom.from) {
    const from = startOfDayIST(custom.from);
    const to = endOfDayIST(custom.to);
    return { key: "custom", label: `${fromStr} → ${toStr}`, from, to, fromKey: fromStr!, toKey: toStr! };
  }
  const build = (k: string, label: string, from: Date, to: Date): Period => ({
    key: k,
    label,
    from,
    to,
    fromKey: dateKeyIST(from),
    toKey: dateKeyIST(to),
  });
  switch (key) {
    case "last-month":
      return build("last-month", "Last month", startOfMonthIST(now, -1), endOfMonthIST(now, -1));
    case "3m":
      return build("3m", "Last 3 months", startOfMonthIST(now, -2), endOfMonthIST(now));
    case "6m":
      return build("6m", "Last 6 months", startOfMonthIST(now, -5), endOfMonthIST(now));
    case "12m":
      return build("12m", "Last 12 months", startOfMonthIST(now, -11), endOfMonthIST(now));
    case "this-year": {
      const wall = new Date(now.getTime() + 330 * 60_000);
      const monthsIn = wall.getUTCMonth();
      return build("this-year", "This year", startOfMonthIST(now, -monthsIn), endOfMonthIST(now));
    }
    default:
      return build("this-month", "This month", startOfMonthIST(now), endOfMonthIST(now));
  }
}

/** Date-only columns compare against calendar dates. */
function dateOnlyRange(p: Period) {
  return { gte: parseDateInput(p.fromKey)!, lte: parseDateInput(p.toKey)! };
}

export type MonthPoint = {
  month: string;
  label: string;
  collections: number;
  expenses: number;
  profit: number;
  billed: number;
  bookings: number;
};

/** Cash in (rental payments net of refunds) vs cash out, month by month. */
export async function monthlySeries(months = 12): Promise<MonthPoint[]> {
  const now = new Date();
  const from = startOfMonthIST(now, -(months - 1));
  const to = endOfMonthIST(now);
  const fromDate = parseDateInput(dateKeyIST(from))!;

  const [payments, refunds, expenses, returned, created] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "SUCCESS", paymentType: { in: [...REVENUE_PAYMENT_TYPES] }, paidAt: { gte: from, lte: to } },
      select: { paidAt: true, amount: true },
    }),
    prisma.refund.findMany({
      where: { kind: "PAYMENT", refundedAt: { gte: from, lte: to } },
      select: { refundedAt: true, amount: true },
    }),
    prisma.expense.findMany({ where: { expenseDate: { gte: fromDate } }, select: { expenseDate: true, amount: true } }),
    prisma.booking.findMany({
      where: { status: { in: ["RETURNED", "CLOSED"] }, actualReturnAt: { gte: from, lte: to } },
      select: { actualReturnAt: true, totalAmount: true },
    }),
    prisma.booking.findMany({
      where: { status: { notIn: ["DRAFT", "QUOTATION"] }, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
  ]);

  const fmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
  const points = new Map<string, MonthPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const start = startOfMonthIST(now, -i);
    const key = monthKeyIST(start);
    points.set(key, { month: key, label: fmt.format(start), collections: 0, expenses: 0, profit: 0, billed: 0, bookings: 0 });
  }

  for (const p of payments) {
    const pt = points.get(monthKeyIST(p.paidAt));
    if (pt) pt.collections += toNum(p.amount);
  }
  for (const r of refunds) {
    const pt = points.get(monthKeyIST(r.refundedAt));
    if (pt) pt.collections -= toNum(r.amount);
  }
  for (const e of expenses) {
    const pt = points.get(e.expenseDate.toISOString().slice(0, 7));
    if (pt) pt.expenses += toNum(e.amount);
  }
  for (const b of returned) {
    const pt = b.actualReturnAt ? points.get(monthKeyIST(b.actualReturnAt)) : undefined;
    if (pt) pt.billed += toNum(b.totalAmount);
  }
  for (const b of created) {
    const pt = points.get(monthKeyIST(b.createdAt));
    if (pt) pt.bookings += 1;
  }

  return [...points.values()].map((p) => ({
    ...p,
    collections: round2(p.collections),
    expenses: round2(p.expenses),
    billed: round2(p.billed),
    profit: round2(p.collections - p.expenses),
  }));
}

export async function periodSummary(p: Period) {
  const [collected, refunded, spent, deposits, bookings, byCategory, byMode] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "SUCCESS", paymentType: { in: [...REVENUE_PAYMENT_TYPES] }, paidAt: { gte: p.from, lte: p.to } },
    }),
    prisma.refund.aggregate({ _sum: { amount: true }, where: { kind: "PAYMENT", refundedAt: { gte: p.from, lte: p.to } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: dateOnlyRange(p) } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "SUCCESS", paymentType: "SECURITY_DEPOSIT", paidAt: { gte: p.from, lte: p.to } },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["RETURNED", "CLOSED"] }, actualReturnAt: { gte: p.from, lte: p.to } },
      select: { totalAmount: true, customerId: true },
    }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { expenseDate: dateOnlyRange(p) }, _sum: { amount: true } }),
    prisma.payment.groupBy({
      by: ["paymentMode"],
      where: { status: "SUCCESS", paymentType: { in: [...REVENUE_PAYMENT_TYPES] }, paidAt: { gte: p.from, lte: p.to } },
      _sum: { amount: true },
    }),
  ]);

  const categories = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const collections = round2(toNum(collected._sum.amount) - toNum(refunded._sum.amount));
  const expenses = round2(toNum(spent._sum.amount));
  const billed = round2(bookings.reduce((s, b) => s + toNum(b.totalAmount), 0));

  return {
    collections,
    expenses,
    profit: round2(collections - expenses),
    margin: collections > 0 ? Math.round(((collections - expenses) / collections) * 100) : null,
    billed,
    completedRentals: bookings.length,
    averageRental: bookings.length ? round2(billed / bookings.length) : 0,
    uniqueCustomers: new Set(bookings.map((b) => b.customerId)).size,
    depositsCollected: round2(toNum(deposits._sum.amount)),
    expenseByCategory: byCategory
      .map((c) => ({ name: catName.get(c.categoryId) ?? "Other", amount: round2(toNum(c._sum.amount)) }))
      .sort((a, b) => b.amount - a.amount),
    collectionsByMode: byMode
      .map((m) => ({ mode: m.paymentMode, amount: round2(toNum(m._sum.amount)) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export type CarRow = {
  id: number;
  name: string;
  registrationNumber: string;
  status: string;
  rentals: number;
  revenue: number;
  expenses: number;
  profit: number;
  utilization: number;
  km: number;
  revenuePerKm: number | null;
};

/** Revenue is what was billed for rentals that ended in the period; expenses are those dated in it. */
export async function carPerformance(p: Period): Promise<CarRow[]> {
  const [cars, bookings, expenses] = await Promise.all([
    prisma.car.findMany({
      where: { OR: [{ status: { not: "INACTIVE" } }, { bookings: { some: { actualReturnAt: { gte: p.from } } } }] },
      select: { id: true, company: true, model: true, registrationNumber: true, status: true, createdAt: true, purchaseDate: true },
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED"] },
        pickupAt: { lte: p.to },
        OR: [{ returnAt: { gte: p.from } }, { actualReturnAt: { gte: p.from } }, { status: "RUNNING" }],
      },
      select: {
        carId: true,
        status: true,
        pickupAt: true,
        returnAt: true,
        actualPickupAt: true,
        actualReturnAt: true,
        totalAmount: true,
        startingKm: true,
        endingKm: true,
      },
    }),
    prisma.expense.groupBy({
      by: ["carId"],
      where: { carId: { not: null }, expenseDate: dateOnlyRange(p) },
      _sum: { amount: true },
    }),
  ]);

  const expenseBy = new Map(expenses.map((e) => [e.carId!, toNum(e._sum.amount)]));

  return cars
    .map((car) => {
      const mine = bookings.filter((b) => b.carId === car.id);
      const ended = mine.filter(
        (b) => (b.status === "RETURNED" || b.status === "CLOSED") && b.actualReturnAt && b.actualReturnAt >= p.from && b.actualReturnAt <= p.to,
      );
      const revenue = round2(ended.reduce((s, b) => s + toNum(b.totalAmount), 0));
      const km = ended.reduce((s, b) => s + (b.startingKm != null && b.endingKm != null ? b.endingKm - b.startingKm : 0), 0);
      const spend = round2(expenseBy.get(car.id) ?? 0);
      // Don't count days before the car was in the system (or its first booking) against it.
      const firstPickup = mine.reduce<Date | null>((min, b) => (!min || b.pickupAt < min ? b.pickupAt : min), null);
      const joined = firstPickup && firstPickup < car.createdAt ? firstPickup : car.createdAt;
      const from = joined > p.from ? joined : p.from;
      return {
        id: car.id,
        name: `${car.company} ${car.model}`,
        registrationNumber: car.registrationNumber,
        status: car.status,
        rentals: ended.length,
        revenue,
        expenses: spend,
        profit: round2(revenue - spend),
        utilization: utilization(mine, from, p.to),
        km,
        revenuePerKm: km > 0 ? round2(revenue / km) : null,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export async function topCustomers(p: Period, limit = 10) {
  const rows = await prisma.booking.groupBy({
    by: ["customerId"],
    where: { status: { in: ["RETURNED", "CLOSED"] }, actualReturnAt: { gte: p.from, lte: p.to } },
    _sum: { totalAmount: true, paidAmount: true },
    _count: { _all: true },
    orderBy: { _sum: { totalAmount: "desc" } },
    take: limit,
  });
  const customers = await prisma.customer.findMany({
    where: { id: { in: rows.map((r) => r.customerId) } },
    select: { id: true, fullName: true, mobile: true, customerType: true },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.customerId,
    name: byId.get(r.customerId)?.fullName ?? "—",
    mobile: byId.get(r.customerId)?.mobile ?? "",
    type: byId.get(r.customerId)?.customerType ?? "REGULAR",
    rentals: r._count._all,
    billed: round2(toNum(r._sum.totalAmount)),
    pending: round2(toNum(r._sum.totalAmount) - toNum(r._sum.paidAmount)),
  }));
}

/** Customers who rented more than once, as a share of everyone who rented. */
export async function repeatRate() {
  const rows = await prisma.booking.groupBy({
    by: ["customerId"],
    where: { status: { in: ["RETURNED", "CLOSED", "RUNNING"] } },
    _count: { _all: true },
  });
  const repeat = rows.filter((r) => r._count._all > 1).length;
  return { customers: rows.length, repeat, rate: rows.length ? Math.round((repeat / rows.length) * 100) : 0 };
}
