"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { BookingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { billTotal, kmCharge, lateHours as computeLateHours, quoteRental } from "@/lib/billing";
import {
  balanceDue,
  depositHeld,
  findConflicts,
  loadRateRules,
  logStatus,
  syncBookingMoney,
} from "@/lib/bookings";
import { createPayment, createRefund, PAYMENT_MODES, TX_OPTIONS, UserFacingError } from "@/lib/payments";
import { nextDocumentNumber } from "@/lib/sequence";
import { getSettings } from "@/lib/settings";
import { saveUpload } from "@/lib/uploads";
import { formatDateTime, formatMoney, round2, toNum } from "@/lib/utils";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { dateTime, id, int, money, optionalMoney, optionalText } from "@/lib/validation";

const modeEnum = z.enum(PAYMENT_MODES);

function refresh(bookingId?: number) {
  revalidatePath("/bookings");
  revalidatePath("/returns");
  revalidatePath("/dashboard");
  revalidatePath("/cars");
  revalidatePath("/payments");
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
}

function handleTxError(error: unknown, formData: FormData | null): FormState {
  if (error instanceof UserFacingError) {
    return fail(formData, error.message, error.field ? { [error.field]: error.message } : undefined);
  }
  throw error;
}

async function savePhotos(formData: FormData, field: string, folder: string) {
  const paths: string[] = [];
  for (const entry of formData.getAll(field).slice(0, 10)) {
    const saved = await saveUpload(entry, folder);
    if (!saved.ok) return { ok: false as const, error: saved.error };
    if (saved.path) paths.push(saved.path);
  }
  return { ok: true as const, paths };
}

// ─────────────────────────────────────────────
// Create / edit
// ─────────────────────────────────────────────

const bookingBase = z.object({
  customerId: id("customer"),
  carId: id("car"),
  pickupAt: dateTime("Pickup time"),
  returnAt: dateTime("Return time"),
  pickupLocation: optionalText(160),
  dropLocation: optionalText(160),
  rateOverride: optionalMoney,
  discountAmount: money("Discount"),
  securityDeposit: money("Security deposit"),
  includedKmPerDay: int("Included km"),
  extraKmRate: money("Extra km rate"),
  notes: optionalText(2000),
  intent: z.enum(["confirm", "quotation"]).default("confirm"),
});

const bookingSchema = bookingBase.refine((d) => d.returnAt > d.pickupAt, {
  path: ["returnAt"],
  message: "Return must be after pickup",
});

const upfrontSchema = z.object({
  advanceAmount: money("Advance"),
  advanceMode: modeEnum.default("CASH"),
  advanceReference: optionalText(80),
  depositAmount: money("Deposit collected"),
  depositMode: modeEnum.default("CASH"),
  depositReference: optionalText(80),
});

const BOOKING_FIELDS = Object.keys(bookingBase.shape);
const UPFRONT_FIELDS = Object.keys(upfrontSchema.shape);

function read(formData: FormData, fields: string[]) {
  return Object.fromEntries(fields.map((f) => [f, formData.get(f) ?? undefined]));
}

async function priceBooking(d: z.infer<typeof bookingSchema>) {
  const car = await prisma.car.findUnique({ where: { id: d.carId } });
  if (!car) throw new UserFacingError("That car no longer exists.", "carId");
  if (car.status === "INACTIVE") throw new UserFacingError("That car is inactive.", "carId");

  const rules = await loadRateRules();
  const quote = quoteRental(
    {
      id: car.id,
      dailyRate: toNum(car.dailyRate),
      includedKmPerDay: d.includedKmPerDay,
      extraKmRate: d.extraKmRate,
      securityDeposit: d.securityDeposit,
    },
    rules,
    d.pickupAt,
    d.returnAt,
  );

  const rentalAmount = d.rateOverride !== undefined ? round2(d.rateOverride * quote.days) : quote.rentalAmount;
  if (d.discountAmount > rentalAmount) {
    throw new UserFacingError("Discount can't be more than the rental amount.", "discountAmount");
  }
  const dailyRate = d.rateOverride ?? quote.averageDailyRate;
  return {
    car,
    days: quote.days,
    dailyRate,
    rentalAmount,
    totalAmount: billTotal({
      rentalAmount,
      extraKmAmount: 0,
      lateFeeAmount: 0,
      fuelAmount: 0,
      damageAmount: 0,
      cleaningAmount: 0,
      otherAmount: 0,
      discountAmount: d.discountAmount,
    }),
  };
}

async function checkCustomer(customerId: number, returnAt: Date) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new UserFacingError("That customer no longer exists.", "customerId");
  if (customer.status === "BLACKLISTED") {
    throw new UserFacingError(
      `${customer.fullName} is blacklisted${customer.blacklistReason ? `: ${customer.blacklistReason}` : ""}.`,
      "customerId",
    );
  }
  if (customer.licenseExpiry && customer.licenseExpiry < returnAt) {
    throw new UserFacingError(
      `${customer.fullName}'s driving licence expires before the return date. Update it on their profile first.`,
      "customerId",
    );
  }
  return customer;
}

async function assertFree(tx: Parameters<typeof syncBookingMoney>[0], carId: number, from: Date, to: Date, exclude?: number) {
  // Lock the car row so two people can't book the same slot at the same moment.
  await tx.$queryRaw`SELECT id FROM cars WHERE id = ${carId} FOR UPDATE`;
  const conflicts = await findConflicts(carId, from, to, exclude, tx);
  if (conflicts.length > 0) {
    const c = conflicts[0];
    throw new UserFacingError(
      `This car is already on ${c.bookingNumber} (${formatDateTime(c.pickupAt)} → ${formatDateTime(c.returnAt)}).`,
      "carId",
    );
  }
}

export async function createBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("bookings.create");
  const parsed = bookingSchema.safeParse(read(formData, BOOKING_FIELDS));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const upfront = upfrontSchema.safeParse(read(formData, UPFRONT_FIELDS));
  if (!upfront.success) return invalid(formData, upfront.error.issues);

  const d = parsed.data;
  const u = upfront.data;
  const status: BookingStatus = d.intent === "quotation" ? "QUOTATION" : "CONFIRMED";

  if (status === "QUOTATION" && (u.advanceAmount > 0 || u.depositAmount > 0)) {
    return fail(formData, "Quotations can't take payments. Confirm the booking to collect an advance.");
  }

  let bookingId: number;
  try {
    await checkCustomer(d.customerId, d.returnAt);
    const priced = await priceBooking(d);
    if (u.advanceAmount > priced.totalAmount) {
      return fail(formData, "Advance is more than the booking total.", { advanceAmount: "Too high" });
    }

    const booking = await prisma.$transaction(async (tx) => {
      if (status === "CONFIRMED") await assertFree(tx, d.carId, d.pickupAt, d.returnAt);

      const created = await tx.booking.create({
        data: {
          bookingNumber: await nextDocumentNumber("BK", tx),
          customerId: d.customerId,
          carId: d.carId,
          status,
          pickupAt: d.pickupAt,
          returnAt: d.returnAt,
          pickupLocation: d.pickupLocation ?? null,
          dropLocation: d.dropLocation ?? null,
          rentalDays: priced.days,
          dailyRate: priced.dailyRate,
          includedKmPerDay: d.includedKmPerDay,
          extraKmRate: d.extraKmRate,
          securityDeposit: d.securityDeposit,
          rentalAmount: priced.rentalAmount,
          discountAmount: d.discountAmount,
          totalAmount: priced.totalAmount,
          notes: d.notes ?? null,
          createdById: actor.id,
        },
      });
      await logStatus(tx, created.id, null, status, actor.id, status === "QUOTATION" ? "Quotation saved" : "Booking confirmed");

      if (u.advanceAmount > 0) {
        await createPayment(tx, {
          customerId: d.customerId,
          bookingId: created.id,
          amount: u.advanceAmount,
          paymentType: "ADVANCE",
          paymentMode: u.advanceMode,
          referenceNo: u.advanceReference,
          receivedById: actor.id,
        });
      }
      if (u.depositAmount > 0) {
        await createPayment(tx, {
          customerId: d.customerId,
          bookingId: created.id,
          amount: u.depositAmount,
          paymentType: "SECURITY_DEPOSIT",
          paymentMode: u.depositMode,
          referenceNo: u.depositReference,
          receivedById: actor.id,
        });
      }
      await syncBookingMoney(tx, created.id);
      return created;
    }, TX_OPTIONS);

    bookingId = booking.id;
    await recordAudit({
      userId: actor.id,
      action: "booking.create",
      entity: "Booking",
      entityId: booking.id,
      summary: `${status === "QUOTATION" ? "Quoted" : "Booked"} ${booking.bookingNumber} · ${priced.car.registrationNumber} · ${formatMoney(priced.totalAmount)}`,
    });
  } catch (error) {
    return handleTxError(error, formData);
  }

  refresh(bookingId);
  redirect(`/bookings/${bookingId}`);
}

export async function updateBookingAction(
  bookingId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("bookings.edit");
  const parsed = bookingSchema.safeParse(read(formData, BOOKING_FIELDS));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const before = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!before) return fail(null, "This booking no longer exists.");
  if (!["DRAFT", "QUOTATION", "CONFIRMED"].includes(before.status)) {
    return fail(null, "Only bookings that haven't started can be edited.");
  }
  if (before.customerId !== d.customerId) {
    const paid = await prisma.payment.count({ where: { bookingId } });
    if (paid > 0) return fail(formData, "Payments are already recorded against this customer, so the customer can't be changed.", { customerId: "Locked" });
  }

  try {
    await checkCustomer(d.customerId, d.returnAt);
    const priced = await priceBooking(d);
    if (toNum(before.paidAmount) > priced.totalAmount + 0.009) {
      return fail(formData, `The customer has already paid ${formatMoney(before.paidAmount)}, which is more than the new total. Refund the difference first.`);
    }

    await prisma.$transaction(async (tx) => {
      if (before.status === "CONFIRMED") await assertFree(tx, d.carId, d.pickupAt, d.returnAt, bookingId);
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          customerId: d.customerId,
          carId: d.carId,
          pickupAt: d.pickupAt,
          returnAt: d.returnAt,
          pickupLocation: d.pickupLocation ?? null,
          dropLocation: d.dropLocation ?? null,
          rentalDays: priced.days,
          dailyRate: priced.dailyRate,
          includedKmPerDay: d.includedKmPerDay,
          extraKmRate: d.extraKmRate,
          securityDeposit: d.securityDeposit,
          rentalAmount: priced.rentalAmount,
          discountAmount: d.discountAmount,
          totalAmount: priced.totalAmount,
          notes: d.notes ?? null,
        },
      });
    }, TX_OPTIONS);

    await recordAudit({
      userId: actor.id,
      action: "booking.update",
      entity: "Booking",
      entityId: bookingId,
      summary: `Edited ${before.bookingNumber}`,
      oldValue: {
        carId: before.carId,
        pickupAt: before.pickupAt,
        returnAt: before.returnAt,
        totalAmount: String(before.totalAmount),
      },
      newValue: { carId: d.carId, pickupAt: d.pickupAt, returnAt: d.returnAt, totalAmount: String(priced.totalAmount) },
    });
  } catch (error) {
    return handleTxError(error, formData);
  }

  refresh(bookingId);
  redirect(`/bookings/${bookingId}`);
}

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

async function loadForTransition(bookingId: number, allowed: BookingStatus[]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { car: true, customer: true },
  });
  if (!booking) throw new UserFacingError("This booking no longer exists.");
  if (!allowed.includes(booking.status)) {
    throw new UserFacingError(`This booking is ${booking.status.toLowerCase()} — that step isn't available.`);
  }
  return booking;
}

export async function confirmQuotationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("bookings.edit");
  const bookingId = Number(formData.get("bookingId"));
  try {
    const booking = await loadForTransition(bookingId, ["DRAFT", "QUOTATION"]);
    await checkCustomer(booking.customerId, booking.returnAt);
    await prisma.$transaction(async (tx) => {
      await assertFree(tx, booking.carId, booking.pickupAt, booking.returnAt, bookingId);
      await tx.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } });
      await logStatus(tx, bookingId, booking.status, "CONFIRMED", actor.id, "Quotation confirmed");
    }, TX_OPTIONS);
    await recordAudit({ userId: actor.id, action: "booking.confirm", entity: "Booking", entityId: bookingId, summary: `Confirmed ${booking.bookingNumber}` });
  } catch (error) {
    return handleTxError(error, null);
  }
  refresh(bookingId);
  return ok("Booking confirmed.");
}

const handoverSchema = z.object({
  handoverAt: dateTime("Handover time"),
  startingKm: int("Starting km"),
  fuelLevel: optionalText(20),
  damageNotes: optionalText(2000),
  depositAmount: money("Deposit"),
  depositMode: modeEnum.default("CASH"),
  depositReference: optionalText(80),
  advanceAmount: money("Payment"),
  advanceMode: modeEnum.default("CASH"),
  advanceReference: optionalText(80),
});

export async function handoverAction(bookingId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("returns.create");
  const parsed = handoverSchema.safeParse(read(formData, Object.keys(handoverSchema.shape)));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const checklist = formData.getAll("checklist").map(String).slice(0, 40);
  const existingDamage = formData.getAll("existingDamage").map(String).slice(0, 30);

  const photos = await savePhotos(formData, "photos", "handover");
  if (!photos.ok) return fail(formData, photos.error, { photos: photos.error });

  try {
    const booking = await loadForTransition(bookingId, ["CONFIRMED"]);
    if (d.startingKm < booking.car.currentKm) {
      return fail(formData, `The odometer can't go backwards — the car was last recorded at ${booking.car.currentKm} km.`, {
        startingKm: `At least ${booking.car.currentKm}`,
      });
    }
    if (booking.car.status === "SERVICE") {
      return fail(formData, "This car is marked as in service. Mark it available first.");
    }
    if (d.advanceAmount > balanceDue(booking) + 0.009) {
      return fail(formData, "That payment is more than the balance due.", { advanceAmount: "Too high" });
    }

    await prisma.$transaction(async (tx) => {
      const other = await tx.booking.findFirst({
        where: { carId: booking.carId, status: { in: ["RUNNING", "HANDED_OVER"] }, id: { not: bookingId } },
        select: { bookingNumber: true },
      });
      if (other) throw new UserFacingError(`This car is still out on ${other.bookingNumber}. Return it first.`);

      await tx.vehicleHandover.create({
        data: {
          bookingId,
          handoverAt: d.handoverAt,
          startingKm: d.startingKm,
          fuelLevel: d.fuelLevel ?? null,
          checklist,
          damageNotes: d.damageNotes ?? null,
          photos: photos.paths,
          handedOverById: actor.id,
        },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "RUNNING", actualPickupAt: d.handoverAt, startingKm: d.startingKm },
      });
      await tx.car.update({ where: { id: booking.carId }, data: { status: "RENTED", currentKm: d.startingKm } });

      for (const panel of existingDamage) {
        await tx.carDamageRecord.create({
          data: {
            carId: booking.carId,
            bookingId,
            panel,
            severity: "MINOR",
            description: "Already present at handover",
            recordedAt: d.handoverAt,
          },
        });
      }

      if (d.depositAmount > 0) {
        await createPayment(tx, {
          customerId: booking.customerId,
          bookingId,
          amount: d.depositAmount,
          paymentType: "SECURITY_DEPOSIT",
          paymentMode: d.depositMode,
          referenceNo: d.depositReference,
          receivedById: actor.id,
        });
      }
      if (d.advanceAmount > 0) {
        await createPayment(tx, {
          customerId: booking.customerId,
          bookingId,
          amount: d.advanceAmount,
          paymentType: toNum(booking.paidAmount) > 0 ? "PARTIAL" : "ADVANCE",
          paymentMode: d.advanceMode,
          referenceNo: d.advanceReference,
          receivedById: actor.id,
        });
      }
      await syncBookingMoney(tx, bookingId);
      await logStatus(tx, bookingId, "CONFIRMED", "RUNNING", actor.id, `Handed over at ${d.startingKm} km`);
    }, TX_OPTIONS);

    await recordAudit({
      userId: actor.id,
      action: "booking.handover",
      entity: "Booking",
      entityId: bookingId,
      summary: `Handed over ${booking.car.registrationNumber} on ${booking.bookingNumber} at ${d.startingKm} km`,
    });
  } catch (error) {
    return handleTxError(error, formData);
  }

  refresh(bookingId);
  redirect(`/bookings/${bookingId}`);
}

const returnSchema = z.object({
  returnedAt: dateTime("Return time"),
  endingKm: int("Ending km"),
  fuelLevel: optionalText(20),
  lateHours: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).optional()),
  fuelAmount: money("Fuel charge"),
  damageAmount: money("Damage charge"),
  cleaningAmount: money("Cleaning charge"),
  otherAmount: money("Other charges"),
  discountAmount: money("Discount"),
  damageNotes: optionalText(2000),
  sendToService: z.preprocess((v) => v === "on", z.boolean()),
  paymentAmount: money("Payment"),
  paymentMode: modeEnum.default("CASH"),
  paymentReference: optionalText(80),
  depositAction: z.enum(["hold", "refund", "adjust"]).default("hold"),
  refundMode: modeEnum.default("CASH"),
});

export async function returnAction(bookingId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("returns.create");
  const parsed = returnSchema.safeParse(read(formData, Object.keys(returnSchema.shape)));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const checklist = formData.getAll("checklist").map(String).slice(0, 40);
  const damagePanels = formData.getAll("newDamage").map(String).slice(0, 30);
  const severity = String(formData.get("damageSeverity") ?? "MINOR");

  const photos = await savePhotos(formData, "photos", "returns");
  if (!photos.ok) return fail(formData, photos.error, { photos: photos.error });

  const settings = await getSettings();
  let closed = false;

  try {
    const booking = await loadForTransition(bookingId, ["RUNNING", "HANDED_OVER"]);
    const startingKm = booking.startingKm ?? booking.car.currentKm;
    if (d.endingKm < startingKm) {
      return fail(formData, `Ending km can't be below the starting reading (${startingKm} km).`, { endingKm: `At least ${startingKm}` });
    }
    if (d.returnedAt < (booking.actualPickupAt ?? booking.pickupAt)) {
      return fail(formData, "Return time is before the car was handed over.", { returnedAt: "Too early" });
    }

    const km = kmCharge({
      startingKm,
      endingKm: d.endingKm,
      rentalDays: booking.rentalDays,
      includedKmPerDay: booking.includedKmPerDay,
      extraKmRate: toNum(booking.extraKmRate),
    });
    const late = d.lateHours ?? computeLateHours(booking.returnAt, d.returnedAt, settings.billing.lateGraceMinutes);
    const hourRate = booking.car.extraHourRate != null ? toNum(booking.car.extraHourRate) : settings.billing.lateFeePerHour;
    const lateFee = round2(late * hourRate);

    const charges = {
      rentalAmount: toNum(booking.rentalAmount),
      extraKmAmount: km.extraKmAmount,
      lateFeeAmount: lateFee,
      fuelAmount: d.fuelAmount,
      damageAmount: d.damageAmount,
      cleaningAmount: d.cleaningAmount,
      otherAmount: d.otherAmount,
      discountAmount: d.discountAmount,
    };
    const total = billTotal(charges);
    const balance = round2(total - toNum(booking.paidAmount));

    if (d.paymentAmount > Math.max(0, balance) + 0.009) {
      return fail(formData, `Payment is more than the balance of ${formatMoney(Math.max(0, balance))}.`, { paymentAmount: "Too high" });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.vehicleReturn.create({
        data: {
          bookingId,
          returnedAt: d.returnedAt,
          endingKm: d.endingKm,
          fuelLevel: d.fuelLevel ?? null,
          checklist,
          damageNotes: d.damageNotes ?? null,
          photos: photos.paths,
          lateHours: late,
          receivedById: actor.id,
        },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "RETURNED",
          actualReturnAt: d.returnedAt,
          endingKm: d.endingKm,
          ...charges,
          totalAmount: total,
        },
      });

      await tx.car.update({
        where: { id: booking.carId },
        data: {
          status: d.sendToService ? "SERVICE" : "AVAILABLE",
          currentKm: Math.max(booking.car.currentKm, d.endingKm),
        },
      });

      for (const panel of damagePanels) {
        await tx.carDamageRecord.create({
          data: {
            carId: booking.carId,
            bookingId,
            panel,
            severity: severity === "MAJOR" ? "MAJOR" : severity === "MODERATE" ? "MODERATE" : "MINOR",
            description: d.damageNotes ?? "Found at return",
            photoUrl: photos.paths[0] ?? null,
            chargedTo: d.damageAmount > 0 ? "customer" : null,
            chargeAmount: d.damageAmount > 0 ? round2(d.damageAmount / damagePanels.length) : null,
            recordedAt: d.returnedAt,
          },
        });
      }

      if (d.paymentAmount > 0) {
        await createPayment(tx, {
          customerId: booking.customerId,
          bookingId,
          amount: d.paymentAmount,
          paymentType: d.paymentAmount + 0.009 >= balance ? "FINAL" : "PARTIAL",
          paymentMode: d.paymentMode,
          referenceNo: d.paymentReference,
          receivedById: actor.id,
        });
      }
      await syncBookingMoney(tx, bookingId);

      const deposit = await depositHeld(bookingId, tx);
      let remaining = round2(balance - d.paymentAmount);

      if (d.depositAction === "adjust" && deposit.held > 0 && remaining > 0) {
        const used = round2(Math.min(deposit.held, remaining));
        await settleFromDeposit(tx, booking, used, actor);
        remaining = round2(remaining - used);
        deposit.held = round2(deposit.held - used);
      }
      if ((d.depositAction === "refund" || d.depositAction === "adjust") && deposit.held > 0) {
        if (remaining > 0.009 && d.depositAction === "refund") {
          throw new UserFacingError(
            `There's still ${formatMoney(remaining)} to collect. Adjust it from the deposit, or hold the deposit until it's paid.`,
            "depositAction",
          );
        }
        await createRefund(tx, {
          customerId: booking.customerId,
          bookingId,
          kind: "DEPOSIT",
          amount: deposit.held,
          refundMode: d.refundMode,
          reason: "Security deposit returned",
          issuedById: actor.id,
        });
        deposit.held = 0;
      }
      await syncBookingMoney(tx, bookingId);

      await logStatus(tx, bookingId, booking.status, "RETURNED", actor.id, `Returned at ${d.endingKm} km · bill ${formatMoney(total)}`);

      if (remaining <= 0.009 && deposit.held <= 0.009) {
        await tx.booking.update({ where: { id: bookingId }, data: { status: "CLOSED" } });
        await logStatus(tx, bookingId, "RETURNED", "CLOSED", actor.id, "Fully settled");
        return true;
      }
      return false;
    }, TX_OPTIONS);
    closed = outcome;

    await recordAudit({
      userId: actor.id,
      action: "booking.return",
      entity: "Booking",
      entityId: bookingId,
      summary: `Received ${booking.car.registrationNumber} on ${booking.bookingNumber} · ${km.totalKm} km · bill ${formatMoney(total)}${closed ? " · closed" : ""}`,
    });
  } catch (error) {
    return handleTxError(error, formData);
  }

  refresh(bookingId);
  redirect(`/bookings/${bookingId}`);
}

async function settleFromDeposit(
  tx: Parameters<typeof syncBookingMoney>[0],
  booking: { id: number; customerId: number },
  amount: number,
  actor: CurrentUser,
) {
  await createRefund(tx, {
    customerId: booking.customerId,
    bookingId: booking.id,
    kind: "DEPOSIT",
    amount,
    refundMode: "OTHER",
    reason: "Adjusted against rental balance",
    issuedById: actor.id,
  });
  await createPayment(tx, {
    customerId: booking.customerId,
    bookingId: booking.id,
    amount,
    paymentType: "FINAL",
    paymentMode: "OTHER",
    referenceNo: "Deposit adjustment",
    notes: "Paid from the security deposit",
    receivedById: actor.id,
  });
}

export async function adjustFromDepositAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("payments.create");
  const bookingId = Number(formData.get("bookingId"));
  try {
    const booking = await loadForTransition(bookingId, ["RUNNING", "RETURNED", "CLOSED", "CANCELLED"]);
    const due = balanceDue(booking);
    const amount = await prisma.$transaction(async (tx) => {
      const deposit = await depositHeld(bookingId, tx);
      const used = round2(Math.min(deposit.held, due));
      if (used <= 0) throw new UserFacingError("There's no deposit held or nothing left to pay.");
      await settleFromDeposit(tx, booking, used, actor);
      await syncBookingMoney(tx, bookingId);
      return used;
    }, TX_OPTIONS);
    await recordAudit({ userId: actor.id, action: "payment.deposit_adjust", entity: "Booking", entityId: bookingId, summary: `Adjusted ${formatMoney(amount)} from deposit on ${booking.bookingNumber}` });
  } catch (error) {
    return handleTxError(error, null);
  }
  refresh(bookingId);
  return ok("Balance adjusted from the deposit.");
}

export async function cancelBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("bookings.edit");
  const bookingId = Number(formData.get("bookingId"));
  const reason = String(formData.get("reason") ?? "").trim();
  const feeRaw = String(formData.get("cancellationFee") ?? "").trim();
  const fee = feeRaw === "" ? 0 : Number(feeRaw);

  if (!reason) return fail(formData, "Give a reason for cancelling.", { reason: "Required" });
  if (!Number.isFinite(fee) || fee < 0) return fail(formData, "Cancellation fee must be a positive number.", { cancellationFee: "Invalid" });

  try {
    const booking = await loadForTransition(bookingId, ["DRAFT", "QUOTATION", "CONFIRMED"]);
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: reason.slice(0, 255),
          rentalAmount: 0,
          extraKmAmount: 0,
          lateFeeAmount: 0,
          fuelAmount: 0,
          damageAmount: 0,
          cleaningAmount: 0,
          discountAmount: 0,
          otherAmount: round2(fee),
          totalAmount: round2(fee),
        },
      });
      await logStatus(
        tx,
        bookingId,
        booking.status,
        "CANCELLED",
        actor.id,
        `${reason} (was ${formatMoney(booking.totalAmount)}${fee > 0 ? `, fee ${formatMoney(fee)}` : ""})`,
      );
    }, TX_OPTIONS);

    await recordAudit({
      userId: actor.id,
      action: "booking.cancel",
      entity: "Booking",
      entityId: bookingId,
      summary: `Cancelled ${booking.bookingNumber}: ${reason}`,
    });

    refresh(bookingId);
    const credit = round2(toNum(booking.paidAmount) - fee);
    return ok(credit > 0 ? `Booking cancelled. ${formatMoney(credit)} paid in advance should be refunded.` : "Booking cancelled.");
  } catch (error) {
    return handleTxError(error, formData);
  }
}

export async function closeBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("bookings.approve");
  const bookingId = Number(formData.get("bookingId"));
  const writeOff = formData.get("writeOff") === "on";

  try {
    const booking = await loadForTransition(bookingId, ["RETURNED"]);
    const due = balanceDue(booking);
    const deposit = await depositHeld(bookingId);
    if (deposit.held > 0.009) {
      return fail(null, `${formatMoney(deposit.held)} of deposit is still held. Refund or adjust it before closing.`);
    }
    if (due > 0.009 && !writeOff) {
      return fail(null, `${formatMoney(due)} is still due. Collect it, or close with a write-off.`);
    }

    await prisma.$transaction(async (tx) => {
      if (due > 0.009) {
        const discount = round2(toNum(booking.discountAmount) + due);
        await tx.booking.update({
          where: { id: bookingId },
          data: { discountAmount: discount, totalAmount: round2(toNum(booking.totalAmount) - due) },
        });
      }
      if (due < -0.009) {
        throw new UserFacingError(`The customer has overpaid by ${formatMoney(-due)}. Refund it before closing.`);
      }
      await tx.booking.update({ where: { id: bookingId }, data: { status: "CLOSED" } });
      await logStatus(tx, bookingId, "RETURNED", "CLOSED", actor.id, due > 0.009 ? `Closed with ${formatMoney(due)} written off` : "Closed");
    }, TX_OPTIONS);

    await recordAudit({
      userId: actor.id,
      action: "booking.close",
      entity: "Booking",
      entityId: bookingId,
      summary: `Closed ${booking.bookingNumber}${due > 0.009 ? ` (wrote off ${formatMoney(due)})` : ""}`,
    });
  } catch (error) {
    return handleTxError(error, null);
  }

  refresh(bookingId);
  return ok("Booking closed.");
}

export async function deleteBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("bookings.delete");
  const bookingId = Number(formData.get("bookingId"));
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { _count: { select: { payments: true, refunds: true, invoices: true } } },
  });
  if (!booking) return fail(null, "Already deleted.");
  if (!["DRAFT", "QUOTATION", "CANCELLED"].includes(booking.status)) {
    return fail(null, "Only quotations and cancelled bookings can be deleted. Cancel it first.");
  }
  if (booking._count.payments + booking._count.refunds + booking._count.invoices > 0) {
    return fail(null, "This booking has payments or invoices on record, so it's kept for the accounts.");
  }

  await prisma.booking.delete({ where: { id: bookingId } });
  await recordAudit({ userId: actor.id, action: "booking.delete", entity: "Booking", entityId: bookingId, summary: `Deleted ${booking.bookingNumber}` });
  refresh();
  redirect("/bookings");
}
