import "server-only";

import { prisma } from "@/lib/db";
import { BILLABLE_STATUSES, REVENUE_PAYMENT_TYPES } from "@/lib/bookings";
import { round2, toNum } from "@/lib/utils";

export type LedgerEntry = {
  key: string;
  date: Date;
  kind: "booking" | "payment" | "refund";
  reference: string;
  href: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

/**
 * Rental charges are debits, rental payments are credits. Security deposits are held
 * money and are kept out of the running balance — they show separately.
 */
export async function customerLedger(customerId: number) {
  const [bookings, payments, refunds] = await Promise.all([
    prisma.booking.findMany({
      where: { customerId, status: { in: BILLABLE_STATUSES } },
      select: {
        id: true,
        bookingNumber: true,
        createdAt: true,
        totalAmount: true,
        status: true,
        car: { select: { company: true, model: true, registrationNumber: true } },
      },
    }),
    prisma.payment.findMany({
      where: { customerId, status: "SUCCESS" },
      select: {
        id: true,
        paymentNumber: true,
        paidAt: true,
        amount: true,
        paymentType: true,
        paymentMode: true,
        booking: { select: { bookingNumber: true } },
      },
    }),
    prisma.refund.findMany({
      where: { customerId },
      select: { id: true, refundNumber: true, refundedAt: true, amount: true, kind: true, reason: true },
    }),
  ]);

  const rows: Omit<LedgerEntry, "balance">[] = [];

  for (const b of bookings) {
    rows.push({
      key: `b${b.id}`,
      date: b.createdAt,
      kind: "booking",
      reference: b.bookingNumber,
      href: `/bookings/${b.id}`,
      description: `${b.car.company} ${b.car.model} · ${b.car.registrationNumber}`,
      debit: toNum(b.totalAmount),
      credit: 0,
    });
  }

  let depositsCollected = 0;
  for (const p of payments) {
    if (p.paymentType === "SECURITY_DEPOSIT") {
      depositsCollected += toNum(p.amount);
      continue;
    }
    if (!(REVENUE_PAYMENT_TYPES as readonly string[]).includes(p.paymentType)) continue;
    rows.push({
      key: `p${p.id}`,
      date: p.paidAt,
      kind: "payment",
      reference: p.paymentNumber,
      href: `/payments/${p.id}`,
      description: `${p.paymentType.toLowerCase()} · ${p.paymentMode.replace("_", " ").toLowerCase()}${
        p.booking ? ` · ${p.booking.bookingNumber}` : ""
      }`,
      debit: 0,
      credit: toNum(p.amount),
    });
  }

  let depositsReturned = 0;
  for (const r of refunds) {
    if (r.kind === "DEPOSIT") {
      depositsReturned += toNum(r.amount);
      continue;
    }
    rows.push({
      key: `r${r.id}`,
      date: r.refundedAt,
      kind: "refund",
      reference: r.refundNumber,
      href: `/payments?tab=refunds`,
      description: r.reason ?? "Refund",
      debit: toNum(r.amount),
      credit: 0,
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));

  let running = 0;
  const entries: LedgerEntry[] = rows.map((row) => {
    running = round2(running + row.debit - row.credit);
    return { ...row, balance: running };
  });

  const billed = round2(rows.reduce((s, r) => s + r.debit, 0));
  const paid = round2(rows.reduce((s, r) => s + r.credit, 0));

  return {
    entries,
    billed,
    paid,
    balance: round2(billed - paid),
    depositsHeld: round2(depositsCollected - depositsReturned),
  };
}

/** Pending balance per customer, for list screens. */
export async function pendingByCustomer(customerIds?: number[]) {
  const rows = await prisma.booking.groupBy({
    by: ["customerId"],
    _sum: { totalAmount: true, paidAmount: true },
    _count: { _all: true },
    where: {
      status: { in: BILLABLE_STATUSES },
      ...(customerIds ? { customerId: { in: customerIds } } : {}),
    },
  });
  return new Map(
    rows.map((r) => [
      r.customerId,
      {
        bookings: r._count._all,
        billed: toNum(r._sum.totalAmount),
        paid: toNum(r._sum.paidAmount),
        pending: round2(toNum(r._sum.totalAmount) - toNum(r._sum.paidAmount)),
      },
    ]),
  );
}
