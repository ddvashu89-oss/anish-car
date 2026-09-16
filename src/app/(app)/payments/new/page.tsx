import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { receivePaymentAction } from "@/lib/actions/payment-actions";
import { toDateTimeInput } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { round2, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentForm } from "../payment-form";

export const metadata: Metadata = { title: "Receive payment · Anish Car Rent" };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; customerId?: string }>;
}) {
  await requirePermission("payments.create");
  const sp = await searchParams;
  const bookingId = Number(sp.bookingId) || undefined;

  const linked = bookingId
    ? await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true } })
    : null;
  const customerId = linked?.customerId ?? (Number(sp.customerId) || undefined);

  const [customers, bookings, deposits] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, mobile: true },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED", "CANCELLED"] } },
      orderBy: { pickupAt: "desc" },
      select: {
        id: true,
        customerId: true,
        bookingNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        securityDeposit: true,
        car: { select: { model: true, registrationNumber: true } },
      },
    }),
    prisma.payment.groupBy({
      by: ["bookingId"],
      where: { paymentType: "SECURITY_DEPOSIT", status: "SUCCESS", bookingId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const depositBy = new Map(deposits.map((d) => [d.bookingId, toNum(d._sum.amount)]));

  // Offer open bookings, plus the one we were sent here for even if it's settled.
  const options = bookings
    .map((b) => ({
      id: b.id,
      customerId: b.customerId,
      status: b.status,
      label: `${b.bookingNumber} · ${b.car.model} ${formatRegistration(b.car.registrationNumber)}`,
      balance: round2(toNum(b.totalAmount) - toNum(b.paidAmount)),
      depositDue: round2(Math.max(0, toNum(b.securityDeposit) - (depositBy.get(b.id) ?? 0))),
    }))
    .filter((b) => b.id === bookingId || b.balance > 0.009 || (b.depositDue > 0 && ["CONFIRMED", "RUNNING"].includes(b.status)));

  return (
    <>
      <PageHeader title="Receive payment" description="Every payment gets its own receipt number and updates the booking balance." />
      <PaymentForm
        action={receivePaymentAction}
        customers={customers.map((c) => ({ id: c.id, label: `${c.fullName} · ${c.mobile}` }))}
        bookings={options}
        defaults={{ customerId, bookingId, paidAt: toDateTimeInput(new Date()) }}
        returnTo={bookingId ? "booking" : undefined}
        cancelHref={bookingId ? `/bookings/${bookingId}` : customerId ? `/customers/${customerId}` : "/payments"}
      />
    </>
  );
}
