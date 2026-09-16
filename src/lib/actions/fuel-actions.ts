"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { PAYMENT_MODES } from "@/lib/payments";
import { nextDocumentNumber } from "@/lib/sequence";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { formatMoney, round2 } from "@/lib/utils";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { dateOnly, id, int, optionalMoney, optionalText, requiredMoney } from "@/lib/validation";

const schema = z.object({
  carId: id("car"),
  filledAt: dateOnly("Date"),
  km: int("Odometer"),
  litres: requiredMoney("Litres"),
  pricePerLitre: optionalMoney,
  amount: optionalMoney,
  station: optionalText(120),
  isFullTank: z.preprocess((v) => v === "on", z.boolean()),
  paymentMode: z.enum(PAYMENT_MODES),
});

export async function createFuelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("fuel.create");
  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  // Enter any two of litres / price / amount; the third is worked out.
  let price = d.pricePerLitre ?? 0;
  let amount = d.amount ?? 0;
  if (!amount && price) amount = round2(d.litres * price);
  if (!price && amount) price = round2(amount / d.litres);
  if (!amount || !price) {
    return fail(formData, "Enter the price per litre or the total amount.", { amount: "Required", pricePerLitre: "Required" });
  }

  const car = await prisma.car.findUnique({ where: { id: d.carId } });
  if (!car) return fail(formData, "That car no longer exists.", { carId: "Not found" });

  const last = await prisma.fuelRecord.findFirst({ where: { carId: d.carId }, orderBy: { km: "desc" } });
  if (last && d.km < last.km && d.filledAt >= last.filledAt) {
    return fail(formData, `The last fill for this car was at ${last.km} km — the odometer can't be lower on a later date.`, { km: "Too low" });
  }

  const bill = await saveUpload(formData.get("bill"), "bills");
  if (!bill.ok) return fail(formData, bill.error, { bill: bill.error });

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.fuelRecord.create({
      data: {
        carId: d.carId,
        filledAt: d.filledAt,
        km: d.km,
        litres: d.litres,
        pricePerLitre: price,
        amount,
        station: d.station ?? null,
        isFullTank: d.isFullTank,
        billUrl: bill.path,
        recordedById: actor.id,
      },
    });
    const category =
      (await tx.expenseCategory.findUnique({ where: { name: "Fuel" } })) ??
      (await tx.expenseCategory.create({ data: { name: "Fuel", isSystem: true } }));
    await tx.expense.create({
      data: {
        expenseNo: await nextDocumentNumber("EXP", tx),
        expenseDate: d.filledAt,
        carId: d.carId,
        categoryId: category.id,
        amount,
        paymentMode: d.paymentMode,
        billUrl: bill.path,
        description: `${d.litres} L at ${formatMoney(price)}/L · ${d.km} km${d.station ? ` · ${d.station}` : ""}`,
        fuelRecordId: created.id,
        createdById: actor.id,
      },
    });
    if (d.km > car.currentKm) await tx.car.update({ where: { id: d.carId }, data: { currentKm: d.km } });
    return created;
  });

  await recordAudit({
    userId: actor.id,
    action: "fuel.create",
    entity: "FuelRecord",
    entityId: record.id,
    summary: `Fuel ${d.litres} L for ${car.registrationNumber} · ${formatMoney(amount)}`,
  });

  revalidatePath("/fuel");
  revalidatePath("/expenses");
  revalidatePath(`/cars/${d.carId}`);
  redirect(String(formData.get("returnTo")) === "car" ? `/cars/${d.carId}?tab=fuel` : "/fuel");
}

export async function deleteFuelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("fuel.delete");
  const fuelId = Number(formData.get("fuelId"));
  const record = await prisma.fuelRecord.findUnique({ where: { id: fuelId }, include: { car: true } });
  if (!record) return fail(null, "Already deleted.");

  await prisma.fuelRecord.delete({ where: { id: fuelId } });
  await deleteUpload(record.billUrl);
  await recordAudit({
    userId: actor.id,
    action: "fuel.delete",
    entity: "FuelRecord",
    entityId: fuelId,
    summary: `Deleted fuel entry for ${record.car.registrationNumber} (${formatMoney(record.amount)})`,
  });

  revalidatePath("/fuel");
  revalidatePath("/expenses");
  revalidatePath(`/cars/${record.carId}`);
  return ok("Fuel entry and its expense deleted.");
}
