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
import { vendorIdFor } from "@/lib/vendors";
import { formatMoney } from "@/lib/utils";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { dateOnly, id, optionalId, optionalText, requiredMoney, requiredText } from "@/lib/validation";

const schema = z.object({
  expenseDate: dateOnly("Date"),
  categoryId: id("category"),
  carId: optionalId,
  amount: requiredMoney("Amount"),
  paymentMode: z.enum(PAYMENT_MODES),
  referenceNo: optionalText(80),
  vendorName: optionalText(120),
  description: optionalText(2000),
});

function refresh(carId?: number | null) {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  if (carId) revalidatePath(`/cars/${carId}`);
}

export async function saveExpenseAction(expenseId: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission(expenseId ? "expenses.edit" : "expenses.create");
  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const before = expenseId ? await prisma.expense.findUnique({ where: { id: expenseId } }) : null;
  if (expenseId && !before) return fail(null, "This expense no longer exists.");
  if (before && (before.maintenanceId || before.fuelRecordId)) {
    return fail(null, "This expense was created from a service or fuel entry — edit that entry instead.");
  }

  const bill = await saveUpload(formData.get("bill"), "bills");
  if (!bill.ok) return fail(formData, bill.error, { bill: bill.error });

  const saved = await prisma.$transaction(async (tx) => {
    const data = {
      expenseDate: d.expenseDate,
      categoryId: d.categoryId,
      carId: d.carId ?? null,
      amount: d.amount,
      paymentMode: d.paymentMode,
      referenceNo: d.referenceNo ?? null,
      vendorId: await vendorIdFor(tx, d.vendorName),
      description: d.description ?? null,
    };
    if (before) {
      return tx.expense.update({ where: { id: before.id }, data: { ...data, ...(bill.path ? { billUrl: bill.path } : {}) } });
    }
    return tx.expense.create({
      data: { ...data, expenseNo: await nextDocumentNumber("EXP", tx), billUrl: bill.path, createdById: actor.id },
    });
  });
  if (before && bill.path) await deleteUpload(before.billUrl);

  await recordAudit({
    userId: actor.id,
    action: before ? "expense.update" : "expense.create",
    entity: "Expense",
    entityId: saved.id,
    summary: `${before ? "Updated" : "Added"} expense ${saved.expenseNo} · ${formatMoney(d.amount)}`,
    oldValue: before ? { amount: String(before.amount), categoryId: before.categoryId, carId: before.carId } : undefined,
    newValue: { amount: d.amount, categoryId: d.categoryId, carId: d.carId },
  });

  refresh(d.carId);
  if (before?.carId && before.carId !== d.carId) refresh(before.carId);
  redirect(String(formData.get("returnTo")) === "car" && d.carId ? `/cars/${d.carId}?tab=expenses` : "/expenses");
}

export async function deleteExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("expenses.delete");
  const expenseId = Number(formData.get("expenseId"));
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return fail(null, "Already deleted.");
  if (expense.maintenanceId) return fail(null, "This came from a service entry — delete it from Maintenance.");
  if (expense.fuelRecordId) return fail(null, "This came from a fuel entry — delete it from Fuel.");

  await prisma.expense.delete({ where: { id: expenseId } });
  await deleteUpload(expense.billUrl);
  await recordAudit({
    userId: actor.id,
    action: "expense.delete",
    entity: "Expense",
    entityId: expenseId,
    summary: `Deleted expense ${expense.expenseNo} · ${formatMoney(expense.amount)}`,
    oldValue: { amount: String(expense.amount), description: expense.description },
  });
  refresh(expense.carId);
  return ok("Expense deleted.");
}

export async function addCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("expenses.create");
  const parsed = requiredText("Category name", 60).safeParse(formData.get("name"));
  if (!parsed.success) return fail(formData, parsed.error.issues[0].message, { name: parsed.error.issues[0].message });
  const exists = await prisma.expenseCategory.findUnique({ where: { name: parsed.data } });
  if (exists) return fail(formData, "That category already exists.", { name: "Already exists" });
  await prisma.expenseCategory.create({ data: { name: parsed.data } });
  revalidatePath("/expenses");
  return ok(`Added “${parsed.data}”.`);
}

export async function deleteCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("expenses.delete");
  const categoryId = Number(formData.get("categoryId"));
  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!category) return fail(null, "Already deleted.");
  if (category.isSystem) return fail(null, "Built-in categories can't be deleted.");
  if (category._count.expenses > 0) return fail(null, `${category._count.expenses} expense(s) use this category.`);
  await prisma.expenseCategory.delete({ where: { id: categoryId } });
  revalidatePath("/expenses");
  return ok("Category deleted.");
}
