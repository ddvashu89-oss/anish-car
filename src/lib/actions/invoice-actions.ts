"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { CHARGE_LABELS } from "@/lib/billing";
import { TX_OPTIONS } from "@/lib/payments";
import { nextDocumentNumber } from "@/lib/sequence";
import { getSettings } from "@/lib/settings";
import { formatDate, round2, toNum } from "@/lib/utils";
import { fail, ok, type FormState } from "@/lib/actions/types";

/**
 * One invoice per booking, built from the booking's charges. Regenerating refreshes the
 * lines but keeps the invoice number, so a customer never gets two numbers for one rental.
 */
export async function generateInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("invoices.create");
  const bookingId = Number(formData.get("bookingId"));

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { car: true, invoices: { orderBy: { id: "desc" }, take: 1 } },
  });
  if (!booking) return fail(null, "This booking no longer exists.");
  if (["DRAFT", "QUOTATION"].includes(booking.status)) {
    return fail(null, "Confirm the booking before invoicing it. Use the quotation print for estimates.");
  }

  const settings = await getSettings();
  const items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = [];

  if (booking.status === "CANCELLED") {
    if (toNum(booking.totalAmount) <= 0) return fail(null, "A cancelled booking with no fee has nothing to invoice.");
    items.push({ description: `Cancellation charge · ${booking.cancellationReason ?? ""}`.trim(), quantity: 1, unitPrice: toNum(booking.otherAmount), amount: toNum(booking.otherAmount) });
  } else {
    const rental = toNum(booking.rentalAmount);
    if (rental > 0) {
      items.push({
        description: `${booking.car.company} ${booking.car.model} (${booking.car.registrationNumber}) · ${formatDate(booking.pickupAt)} – ${formatDate(booking.returnAt)}`,
        quantity: booking.rentalDays,
        unitPrice: round2(rental / booking.rentalDays),
        amount: rental,
      });
    }
    const km = booking.startingKm != null && booking.endingKm != null ? booking.endingKm - booking.startingKm : null;
    for (const [key, label] of CHARGE_LABELS) {
      if (key === "rentalAmount") continue;
      const amount = toNum(booking[key]);
      if (amount <= 0) continue;
      if (key === "extraKmAmount" && km !== null) {
        const extraKm = Math.round(amount / Math.max(toNum(booking.extraKmRate), 0.01));
        items.push({ description: `${label} (${extraKm} km beyond allowance)`, quantity: extraKm, unitPrice: toNum(booking.extraKmRate), amount });
      } else {
        items.push({ description: label, quantity: 1, unitPrice: amount, amount });
      }
    }
  }

  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const discount = booking.status === "CANCELLED" ? 0 : toNum(booking.discountAmount);
  const total = toNum(booking.totalAmount);
  // Prices are tax-inclusive: show the GST share without changing what the customer owes.
  const tax = settings.billing.taxPercent > 0 ? round2(total - total / (1 + settings.billing.taxPercent / 100)) : 0;
  const paid = toNum(booking.paidAmount);
  const status = paid + 0.009 >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED";

  const existing = booking.invoices[0];
  const invoice = await prisma.$transaction(async (tx) => {
    const data = {
      customerId: booking.customerId,
      subtotal,
      discount,
      taxAmount: tax,
      total,
      paidAmount: paid,
      status: status as "PAID" | "PARTIALLY_PAID" | "ISSUED",
      notes: settings.billing.invoiceTerms || null,
    };
    if (existing) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      return tx.invoice.update({
        where: { id: existing.id },
        data: { ...data, items: { create: items.map((i, n) => ({ ...i, sortOrder: n })) } },
      });
    }
    return tx.invoice.create({
      data: {
        ...data,
        invoiceNumber: await nextDocumentNumber("INV", tx),
        bookingId,
        createdById: actor.id,
        items: { create: items.map((i, n) => ({ ...i, sortOrder: n })) },
      },
    });
  }, TX_OPTIONS);

  await recordAudit({
    userId: actor.id,
    action: existing ? "invoice.update" : "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `${existing ? "Refreshed" : "Issued"} ${invoice.invoiceNumber} for ${booking.bookingNumber}`,
  });

  revalidatePath("/invoices");
  revalidatePath(`/bookings/${bookingId}`);
  redirect(`/invoices/${invoice.id}`);
}

export async function cancelInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("invoices.delete");
  const invoiceId = Number(formData.get("invoiceId"));
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return fail(null, "This invoice no longer exists.");
  if (invoice.status === "CANCELLED") return fail(null, "Already cancelled.");

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
  await recordAudit({
    userId: actor.id,
    action: "invoice.cancel",
    entity: "Invoice",
    entityId: invoiceId,
    summary: `Cancelled ${invoice.invoiceNumber}`,
  });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return ok("Invoice cancelled. The number stays reserved so the sequence has no gaps.");
}
