import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRegistration } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { labelOf, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { formatDateTime, formatMoney, round2, toNum } from "@/lib/utils";
import { voidPaymentAction } from "@/lib/actions/payment-actions";
import { ActionButton } from "@/components/form/action-form";
import { Letterhead, Paper, PaperRow, PaperSection, Signatures } from "@/components/print/paper";
import { PrintToolbar } from "@/components/print/print-toolbar";

export const metadata: Metadata = { title: "Receipt · Anish Car Rent" };

const words = (n: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));
  if (n === 0) return "Zero";
  // Indian grouping: crore, lakh, thousand, hundred.
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return parts.join(" ");
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("payments.view");
  const paymentId = Number((await params).id);
  if (!Number.isInteger(paymentId)) notFound();

  const [payment, settings] = await Promise.all([
    prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        customer: true,
        receivedBy: { select: { name: true } },
        booking: { include: { car: { select: { company: true, model: true, registrationNumber: true } } } },
      },
    }),
    getSettings(),
  ]);
  if (!payment) notFound();

  const amount = toNum(payment.amount);
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const inWords = `Rupees ${words(rupees)}${paise ? ` and ${words(paise)} Paise` : ""} Only`;
  const balance = payment.booking ? round2(toNum(payment.booking.totalAmount) - toNum(payment.booking.paidAmount)) : null;
  const text = [
    `Payment received — thank you, ${payment.customer.fullName}.`,
    `Receipt: ${payment.paymentNumber}`,
    `Amount: ${formatMoney(amount)} via ${labelOf(PAYMENT_MODE_OPTIONS, payment.paymentMode)}`,
    payment.booking ? `Booking: ${payment.booking.bookingNumber}` : null,
    balance !== null ? (balance > 0 ? `Balance due: ${formatMoney(balance)}` : "Your booking is fully paid.") : null,
    settings.company.name,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <PrintToolbar
        backHref={payment.booking ? `/bookings/${payment.booking.id}` : "/payments"}
        backLabel={payment.booking ? `Back to ${payment.booking.bookingNumber}` : "Back to payments"}
        whatsapp={{ phone: payment.customer.mobile, text }}
        email={payment.customer.email ? { to: payment.customer.email, subject: `Receipt ${payment.paymentNumber}`, body: text } : undefined}
      >
        {payment.status === "SUCCESS" && can(actor, "payments.delete") ? (
          <ActionButton
            action={voidPaymentAction}
            fields={{ paymentId: payment.id, reason: "Voided from receipt" }}
            confirm="Void this payment? It will stop counting as received."
            variant="outline"
            size="md"
            className="text-danger"
          >
            Void payment
          </ActionButton>
        ) : null}
      </PrintToolbar>

      <Paper>
        <Letterhead
          company={settings.company}
          title={payment.status === "SUCCESS" ? "Payment receipt" : "Receipt — VOID"}
          meta={[
            ["Receipt", payment.paymentNumber],
            ["Date", formatDateTime(payment.paidAt)],
          ]}
        />

        <PaperSection title="Received from">
          <p className="font-semibold">{payment.customer.fullName}</p>
          <p className="text-zinc-600">
            {payment.customer.mobile} · {payment.customer.customerCode}
          </p>
        </PaperSection>

        <PaperSection title="Details">
          <PaperRow label="Payment for" value={labelOf(PAYMENT_TYPE_OPTIONS, payment.paymentType)} />
          <PaperRow label="Mode" value={labelOf(PAYMENT_MODE_OPTIONS, payment.paymentMode)} />
          {payment.referenceNo ? <PaperRow label="Reference" value={payment.referenceNo} /> : null}
          {payment.booking ? (
            <>
              <PaperRow label="Booking" value={payment.booking.bookingNumber} />
              <PaperRow
                label="Vehicle"
                value={`${payment.booking.car.company} ${payment.booking.car.model} · ${formatRegistration(payment.booking.car.registrationNumber)}`}
              />
            </>
          ) : null}
          {payment.notes ? <PaperRow label="Note" value={payment.notes} /> : null}
          <PaperRow label="Amount received" value={formatMoney(amount)} strong />
          <p className="mt-1 text-[12px] text-zinc-600 italic">{inWords}</p>
          {payment.booking && balance !== null && payment.paymentType !== "SECURITY_DEPOSIT" ? (
            <div className="mt-3 rounded border border-zinc-200 p-3">
              <PaperRow label="Booking total" value={formatMoney(payment.booking.totalAmount)} />
              <PaperRow label="Paid to date" value={formatMoney(payment.booking.paidAmount)} />
              <PaperRow label="Balance" value={formatMoney(Math.max(0, balance))} />
            </div>
          ) : null}
        </PaperSection>

        <Signatures left="Customer" right={`Received by ${payment.receivedBy?.name ?? settings.company.name}`} />
      </Paper>
    </>
  );
}
