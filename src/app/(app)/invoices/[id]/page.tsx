import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { depositHeld } from "@/lib/bookings";
import { formatRegistration } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatKm, formatMoney, formatNumber, round2, toNum } from "@/lib/utils";
import { cancelInvoiceAction, generateInvoiceAction } from "@/lib/actions/invoice-actions";
import { ActionButton } from "@/components/form/action-form";
import { Letterhead, Paper, PaperRow, PaperSection } from "@/components/print/paper";
import { PrintToolbar } from "@/components/print/print-toolbar";

export const metadata: Metadata = { title: "Invoice · Anish Car Rent" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("invoices.view");
  const invoiceId = Number((await params).id);
  if (!Number.isInteger(invoiceId)) notFound();

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        booking: { include: { car: true } },
      },
    }),
    getSettings(),
  ]);
  if (!invoice) notFound();

  const b = invoice.booking;
  const deposit = b ? await depositHeld(b.id) : null;
  const total = toNum(invoice.total);
  const paid = toNum(invoice.paidAmount);
  const balance = round2(total - paid);
  const cancelled = invoice.status === "CANCELLED";

  const text = [
    `Hello ${invoice.customer.fullName},`,
    "",
    `Invoice ${invoice.invoiceNumber}${b ? ` for booking ${b.bookingNumber}` : ""}`,
    `Total: ${formatMoney(total)}`,
    `Paid: ${formatMoney(paid)}`,
    balance > 0 ? `Balance due: ${formatMoney(balance)}` : "Fully paid — thank you!",
    "",
    settings.company.name,
    settings.company.phone,
  ].join("\n");

  return (
    <>
      <PrintToolbar
        backHref={b ? `/bookings/${b.id}` : "/invoices"}
        backLabel={b ? `Back to ${b.bookingNumber}` : "Back to invoices"}
        whatsapp={{ phone: invoice.customer.mobile, text }}
        email={invoice.customer.email ? { to: invoice.customer.email, subject: `Invoice ${invoice.invoiceNumber}`, body: text } : undefined}
      >
        {b && !cancelled && can(actor, "invoices.create") ? (
          <ActionButton action={generateInvoiceAction} fields={{ bookingId: b.id }} variant="outline" size="md">
            Refresh from booking
          </ActionButton>
        ) : null}
        {!cancelled && can(actor, "invoices.delete") ? (
          <ActionButton
            action={cancelInvoiceAction}
            fields={{ invoiceId: invoice.id }}
            confirm="Cancel this invoice? The number is kept on record."
            variant="outline"
            size="md"
            className="text-danger"
          >
            Cancel invoice
          </ActionButton>
        ) : null}
      </PrintToolbar>

      <Paper>
        <Letterhead
          company={settings.company}
          title={cancelled ? "Invoice — CANCELLED" : settings.company.gstin ? "Tax invoice" : "Invoice"}
          meta={[
            ["Invoice", invoice.invoiceNumber],
            ["Date", formatDate(invoice.issuedAt)],
            ...(b ? ([["Booking", b.bookingNumber]] as Array<[string, string]>) : []),
          ]}
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <PaperSection title="Bill to">
            <p className="font-semibold">{invoice.customer.fullName}</p>
            <p>{invoice.customer.mobile}</p>
            {invoice.customer.address ? (
              <p className="text-zinc-600">
                {[invoice.customer.address, invoice.customer.city, invoice.customer.state, invoice.customer.pincode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            ) : null}
          </PaperSection>
          {b ? (
            <PaperSection title="Rental">
              <p className="font-semibold">
                {b.car.company} {b.car.model} · <span className="font-mono">{formatRegistration(b.car.registrationNumber)}</span>
              </p>
              <p className="text-zinc-600">
                {formatDateTime(b.actualPickupAt ?? b.pickupAt)} → {formatDateTime(b.actualReturnAt ?? b.returnAt)}
              </p>
              {b.startingKm != null ? (
                <p className="text-zinc-600">
                  Odometer {formatKm(b.startingKm)}
                  {b.endingKm != null ? ` → ${formatKm(b.endingKm)} (${formatKm(b.endingKm - b.startingKm)})` : ""}
                </p>
              ) : null}
            </PaperSection>
          ) : null}
        </div>

        <table className="mt-6 w-full text-left">
          <thead>
            <tr className="border-y border-zinc-300 text-[11px] tracking-wider text-zinc-500 uppercase">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Rate</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-4">{item.description}</td>
                <td className="py-2 text-right tabular-nums">{formatNumber(item.quantity)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs">
          <PaperRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
          {toNum(invoice.discount) > 0 ? <PaperRow label="Discount" value={`− ${formatMoney(invoice.discount)}`} /> : null}
          <PaperRow label="Total" value={formatMoney(total)} strong />
          {toNum(invoice.taxAmount) > 0 ? (
            <p className="text-right text-[11px] text-zinc-500">
              Includes GST @ {settings.billing.taxPercent}%: {formatMoney(invoice.taxAmount)}
            </p>
          ) : null}
          <PaperRow label="Paid" value={formatMoney(paid)} />
          <PaperRow label={balance < 0 ? "Refundable" : "Balance due"} value={formatMoney(Math.abs(balance))} strong />
          {deposit && deposit.collected > 0 ? (
            <div className="mt-2 border-t border-zinc-200 pt-2 text-zinc-600">
              <PaperRow label="Security deposit collected" value={formatMoney(deposit.collected)} />
              <PaperRow label="Deposit returned / adjusted" value={formatMoney(deposit.refunded)} />
            </div>
          ) : null}
        </div>

        {invoice.notes ? (
          <PaperSection title="Terms">
            <p className="whitespace-pre-line text-[12px] text-zinc-600">{invoice.notes}</p>
          </PaperSection>
        ) : null}

        <p className="mt-10 text-center text-[11px] text-zinc-400">
          Thank you for choosing {settings.company.name}. This is a computer-generated invoice.
        </p>
      </Paper>
    </>
  );
}
