import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMode, PaymentType, RefundKind } from "@/generated/prisma/enums";
import { nextDocumentNumber } from "@/lib/sequence";

type Tx = Prisma.TransactionClient;

export const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;
export const PAYMENT_TYPES = ["ADVANCE", "PARTIAL", "FINAL", "SECURITY_DEPOSIT", "PENALTY", "OTHER"] as const;

export async function createPayment(
  tx: Tx,
  input: {
    customerId: number;
    bookingId?: number | null;
    amount: number;
    paymentType: PaymentType;
    paymentMode: PaymentMode;
    referenceNo?: string | null;
    notes?: string | null;
    paidAt?: Date;
    receivedById: number;
  },
) {
  return tx.payment.create({
    data: {
      paymentNumber: await nextDocumentNumber("PAY", tx),
      customerId: input.customerId,
      bookingId: input.bookingId ?? null,
      amount: input.amount,
      paymentType: input.paymentType,
      paymentMode: input.paymentMode,
      referenceNo: input.referenceNo ?? null,
      notes: input.notes ?? null,
      paidAt: input.paidAt ?? new Date(),
      receivedById: input.receivedById,
      status: "SUCCESS",
    },
  });
}

export async function createRefund(
  tx: Tx,
  input: {
    customerId: number;
    bookingId?: number | null;
    paymentId?: number | null;
    kind: RefundKind;
    amount: number;
    refundMode: PaymentMode;
    reason?: string | null;
    issuedById: number;
  },
) {
  return tx.refund.create({
    data: {
      refundNumber: await nextDocumentNumber("RF", tx),
      customerId: input.customerId,
      bookingId: input.bookingId ?? null,
      paymentId: input.paymentId ?? null,
      kind: input.kind,
      amount: input.amount,
      refundMode: input.refundMode,
      reason: input.reason ?? null,
      issuedById: input.issuedById,
    },
  });
}

/** Thrown inside a transaction to roll it back with a message the form can show. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
