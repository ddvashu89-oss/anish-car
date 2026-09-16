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
import { vendorIdFor } from "@/lib/vendors";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { dateOnly, id, int, money, optionalDateOnly, optionalInt, optionalText } from "@/lib/validation";

const CATEGORY_FOR: Record<string, string> = {
  GENERAL_SERVICE: "Service",
  REPAIR: "Repair",
  TYRE: "Tyre",
  BATTERY: "Battery",
  BODY_WORK: "Repair",
  OTHER: "Other",
};

const schema = z.object({
  carId: id("car"),
  serviceDate: dateOnly("Service date"),
  km: int("Odometer"),
  serviceType: z.enum(["GENERAL_SERVICE", "REPAIR", "TYRE", "BATTERY", "BODY_WORK", "OTHER"]),
  garageName: optionalText(120),
  labourCost: money("Labour"),
  nextServiceKm: optionalInt,
  nextServiceDate: optionalDateOnly,
  paymentMode: z.enum(PAYMENT_MODES),
  notes: optionalText(2000),
  markAvailable: z.preprocess((v) => v === "on", z.boolean()),
});

export async function createMaintenanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("maintenance.create");
  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const names = formData.getAll("partName").map((v) => String(v).trim());
  const qtys = formData.getAll("partQty").map((v) => Number(v));
  const costs = formData.getAll("partCost").map((v) => Number(v));
  const parts: Array<{ partName: string; quantity: number; unitCost: number; amount: number }> = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    const quantity = Number.isFinite(qtys[i]) && qtys[i] > 0 ? qtys[i] : 1;
    const unitCost = Number.isFinite(costs[i]) && costs[i] >= 0 ? costs[i] : NaN;
    if (Number.isNaN(unitCost)) return fail(formData, `Enter a cost for "${names[i]}".`);
    parts.push({ partName: names[i].slice(0, 120), quantity, unitCost, amount: round2(quantity * unitCost) });
  }
  const partsCost = round2(parts.reduce((s, p) => s + p.amount, 0));
  const totalCost = round2(partsCost + d.labourCost);
  if (totalCost <= 0) return fail(formData, "Add the labour cost or at least one part with a price.");

  const car = await prisma.car.findUnique({ where: { id: d.carId } });
  if (!car) return fail(formData, "That car no longer exists.", { carId: "Not found" });
  if (d.nextServiceKm !== undefined && d.nextServiceKm <= d.km) {
    return fail(formData, "Next service km should be above the current reading.", { nextServiceKm: "Too low" });
  }

  const bill = await saveUpload(formData.get("bill"), "bills");
  if (!bill.ok) return fail(formData, bill.error, { bill: bill.error });

  const record = await prisma.$transaction(async (tx) => {
    const vendorId = await vendorIdFor(tx, d.garageName);
    const created = await tx.maintenance.create({
      data: {
        carId: d.carId,
        serviceDate: d.serviceDate,
        km: d.km,
        serviceType: d.serviceType,
        vendorId,
        garageName: d.garageName ?? null,
        partsCost,
        labourCost: d.labourCost,
        totalCost,
        nextServiceKm: d.nextServiceKm ?? null,
        nextServiceDate: d.nextServiceDate ?? null,
        billUrl: bill.path,
        notes: d.notes ?? null,
        createdById: actor.id,
        parts: { create: parts },
      },
    });

    const categoryName = CATEGORY_FOR[d.serviceType] ?? "Service";
    const category =
      (await tx.expenseCategory.findUnique({ where: { name: categoryName } })) ??
      (await tx.expenseCategory.create({ data: { name: categoryName } }));
    await tx.expense.create({
      data: {
        expenseNo: await nextDocumentNumber("EXP", tx),
        expenseDate: d.serviceDate,
        carId: d.carId,
        categoryId: category.id,
        vendorId,
        amount: totalCost,
        paymentMode: d.paymentMode,
        billUrl: bill.path,
        description: `${categoryName} at ${d.km} km${d.garageName ? ` · ${d.garageName}` : ""}${parts.length ? ` · ${parts.map((p) => p.partName).join(", ")}` : ""}`.slice(0, 2000),
        maintenanceId: created.id,
        createdById: actor.id,
      },
    });

    // A general service resets the schedule; repairs only move it if a new target was given.
    const serviceDueKm =
      d.nextServiceKm ??
      (d.serviceType === "GENERAL_SERVICE" && car.serviceIntervalKm ? d.km + car.serviceIntervalKm : car.serviceDueKm);
    await tx.car.update({
      where: { id: d.carId },
      data: {
        currentKm: Math.max(car.currentKm, d.km),
        serviceDueKm,
        ...(d.nextServiceDate ? { nextServiceDate: d.nextServiceDate } : d.serviceType === "GENERAL_SERVICE" ? { nextServiceDate: null } : {}),
        ...(d.markAvailable && car.status === "SERVICE" ? { status: "AVAILABLE" } : {}),
      },
    });
    return created;
  });

  await recordAudit({
    userId: actor.id,
    action: "maintenance.create",
    entity: "Maintenance",
    entityId: record.id,
    summary: `Logged ${d.serviceType.toLowerCase().replace("_", " ")} for ${car.registrationNumber} · ${formatMoney(totalCost)}`,
  });

  revalidatePath("/maintenance");
  revalidatePath("/expenses");
  revalidatePath(`/cars/${d.carId}`);
  redirect(String(formData.get("returnTo")) === "car" ? `/cars/${d.carId}?tab=maintenance` : "/maintenance");
}

export async function deleteMaintenanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("maintenance.delete");
  const maintenanceId = Number(formData.get("maintenanceId"));
  const record = await prisma.maintenance.findUnique({ where: { id: maintenanceId }, include: { car: true } });
  if (!record) return fail(null, "Already deleted.");

  // The linked expense is removed by the database (cascade).
  await prisma.maintenance.delete({ where: { id: maintenanceId } });
  await deleteUpload(record.billUrl);
  await recordAudit({
    userId: actor.id,
    action: "maintenance.delete",
    entity: "Maintenance",
    entityId: maintenanceId,
    summary: `Deleted service record for ${record.car.registrationNumber} (${formatMoney(record.totalCost)})`,
  });

  revalidatePath("/maintenance");
  revalidatePath("/expenses");
  revalidatePath(`/cars/${record.carId}`);
  return ok("Service record and its expense deleted.");
}
