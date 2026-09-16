"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { balanceDue, depositHeld, REVENUE_PAYMENT_TYPES, syncBookingMoney } from "@/lib/bookings";
import { createPayment, createRefund, PAYMENT_MODES, PAYMENT_TYPES, TX_OPTIONS, UserFacingError } from "@/lib/payments";
import { formatMoney, round2, toNum } from "@/lib/utils";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { dateTime, id, optionalId, optionalText, requiredMoney } from "@/lib/validation";

function refresh(bookingId?: number | null, customerId?: number) {
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

const paymentSchema = z.object({
  customerId: id("customer"),
  bookingId: optionalId,
  amount: requiredMoney("Amount"),
  paymentType: z.enum(PAYMENT_TYPES),
  paymentMode: z.enum(PAYMENT_MODES),
  referenceNo: optionalText(80),
  paidAt: dateTime("Payment date"),
  notes: optionalText(255),
});

export async function receivePaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("payments.create");
  const parsed = paymentSchema.safeParse(Object.fromEntries(Object.keys(paymentSchema.shape).map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  if (d.paidAt.getTime() > Date.now() + 5 * 60_000) {
    return fail(formData, "Payment date can't be in the future.", { paidAt: "In the future" });
  }
  if (["UPI", "BANK_TRANSFER", "CHEQUE"].includes(d.paymentMode) && !d.referenceNo) {
    return fail(formData, "Add the UTR / transaction or cheque number for this payment.", { referenceNo: "Required for this mode" });
  }

  let paymentId: number;
  try {
    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) throw new UserFacingError("That customer no longer exists.", "customerId");

    const booking = d.bookingId ? await prisma.booking.findUnique({ where: { id: d.bookingId } }) : null;
    if (d.bookingId && !booking) throw new UserFacingError("That booking no longer exists.", "bookingId");
    if (booking && booking.customerId !== d.customerId) {
      throw new UserFacingError("That booking belongs to a different customer.", "bookingId");
    }
    if (booking && ["DRAFT", "QUOTATION"].includes(booking.status)) {
      throw new UserFacingError("Confirm the quotation before taking payment.", "bookingId");
    }
    const isRevenue = (REVENUE_PAYMENT_TYPES as readonly string[]).includes(d.paymentType);
    if (booking && isRevenue && d.paymentType !== "PENALTY") {
      const due = balanceDue(booking);
      if (d.amount > due + 0.009) {
        throw new UserFacingError(
          due > 0 ? `Only ${formatMoney(due)} is due on ${booking.bookingNumber}.` : `Nothing is due on ${booking.bookingNumber}.`,
          "amount",
        );
      }
    }
    if (d.paymentType === "SECURITY_DEPOSIT" && !booking) {
      throw new UserFacingError("A security deposit must be linked to a booking.", "bookingId");
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await createPayment(tx, {
        customerId: d.customerId,
        bookingId: booking?.id ?? null,
        amount: d.amount,
        paymentType: d.paymentType,
        paymentMode: d.paymentMode,
        referenceNo: d.referenceNo,
        notes: d.notes,
        paidAt: d.paidAt,
        receivedById: actor.id,
      });
      if (booking) {
        // A penalty adds to what the customer owes as well as recording the payment.
        if (d.paymentType === "PENALTY") {
          await tx.booking.update({
            where: { id: booking.id },
            data: {
              otherAmount: round2(toNum(booking.otherAmount) + d.amount),
              totalAmount: round2(toNum(booking.totalAmount) + d.amount),
            },
          });
        }
        await syncBookingMoney(tx, booking.id);
      }
      return created;
    }, TX_OPTIONS);
    paymentId = payment.id;

    await recordAudit({
      userId: actor.id,
      action: "payment.create",
      entity: "Payment",
      entityId: payment.id,
      summary: `Received ${formatMoney(d.amount)} from ${customer.fullName} (${payment.paymentNumber})`,
      newValue: { amount: d.amount, mode: d.paymentMode, type: d.paymentType, booking: booking?.bookingNumber },
    });
    refresh(booking?.id, customer.id);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return fail(formData, error.message, error.field ? { [error.field]: error.message } : undefined);
    }
    throw error;
  }

  const returnTo = String(formData.get("returnTo") ?? "");
  if (returnTo === "booking" && d.bookingId) redirect(`/bookings/${d.bookingId}`);
  redirect(`/payments/${paymentId}`);
}

export async function voidPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("payments.delete");
  const paymentId = Number(formData.get("paymentId"));
  const reason = String(formData.get("reason") ?? "").trim() || "Voided";

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
  if (!payment) return fail(null, "This payment no longer exists.");
  if (payment.status !== "SUCCESS") return fail(null, "This payment is already void.");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "FAILED", notes: `${payment.notes ? `${payment.notes} · ` : ""}Void: ${reason}`.slice(0, 255) },
      });
      if (payment.bookingId) {
        if (payment.paymentType === "SECURITY_DEPOSIT") {
          const deposit = await depositHeld(payment.bookingId, tx);
          if (deposit.held < -0.009) {
            throw new UserFacingError("Part of this deposit has already been refunded or adjusted, so it can't be voided.");
          }
        }
        if (payment.paymentType === "PENALTY" && payment.booking) {
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: {
              otherAmount: round2(Math.max(0, toNum(payment.booking.otherAmount) - toNum(payment.amount))),
              totalAmount: round2(Math.max(0, toNum(payment.booking.totalAmount) - toNum(payment.amount))),
            },
          });
        }
        await syncBookingMoney(tx, payment.bookingId);
      }
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof UserFacingError) return fail(null, error.message);
    throw error;
  }

  await recordAudit({
    userId: actor.id,
    action: "payment.void",
    entity: "Payment",
    entityId: paymentId,
    summary: `Voided ${payment.paymentNumber} (${formatMoney(payment.amount)}): ${reason}`,
    oldValue: { status: "SUCCESS" },
    newValue: { status: "FAILED" },
  });
  refresh(payment.bookingId, payment.customerId);
  return ok("Payment voided.");
}

const refundSchema = z.object({
  customerId: id("customer"),
  bookingId: optionalId,
  kind: z.enum(["DEPOSIT", "PAYMENT"]),
  amount: requiredMoney("Amount"),
  refundMode: z.enum(PAYMENT_MODES),
  reason: optionalText(255),
});

export async function refundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("payments.create");
  const parsed = refundSchema.safeParse(Object.fromEntries(Object.keys(refundSchema.shape).map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  try {
    const booking = d.bookingId ? await prisma.booking.findUnique({ where: { id: d.bookingId } }) : null;
    if (booking && booking.customerId !== d.customerId) throw new UserFacingError("Booking and customer don't match.");
    if (d.kind === "DEPOSIT" && !booking) throw new UserFacingError("Deposit refunds must be linked to a booking.");

    const refund = await prisma.$transaction(async (tx) => {
      if (d.kind === "DEPOSIT") {
        const deposit = await depositHeld(booking!.id, tx);
        if (d.amount > deposit.held + 0.009) {
          throw new UserFacingError(`Only ${formatMoney(deposit.held)} of deposit is held.`, "amount");
        }
      } else if (booking) {
        const credit = round2(toNum(booking.paidAmount) - toNum(booking.totalAmount));
        if (d.amount > credit + 0.009) {
          throw new UserFacingError(
            credit > 0 ? `The customer has only overpaid ${formatMoney(credit)} on this booking.` : "Nothing has been overpaid on this booking.",
            "amount",
          );
        }
      }
      const created = await createRefund(tx, {
        customerId: d.customerId,
        bookingId: booking?.id ?? null,
        kind: d.kind,
        amount: d.amount,
        refundMode: d.refundMode,
        reason: d.reason ?? (d.kind === "DEPOSIT" ? "Security deposit returned" : "Refund of overpayment"),
        issuedById: actor.id,
      });
      if (booking) await syncBookingMoney(tx, booking.id);
      return created;
    }, TX_OPTIONS);

    await recordAudit({
      userId: actor.id,
      action: "payment.refund",
      entity: "Refund",
      entityId: refund.id,
      summary: `Refunded ${formatMoney(d.amount)} (${d.kind.toLowerCase()})${booking ? ` on ${booking.bookingNumber}` : ""}`,
    });
    refresh(booking?.id, d.customerId);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return fail(formData, error.message, error.field ? { [error.field]: error.message } : undefined);
    }
    throw error;
  }
  return ok("Refund recorded.");
}
