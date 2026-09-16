import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveExpenseAction } from "@/lib/actions/expense-actions";
import { todayKeyIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { ExpenseForm } from "../../expense-form";
import { expenseFormOptions } from "../../options";

export const metadata: Metadata = { title: "Edit expense · Anish Car Rent" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("expenses.edit");
  const expenseId = Number((await params).id);
  if (!Number.isInteger(expenseId)) notFound();

  const [expense, options] = await Promise.all([
    prisma.expense.findUnique({ where: { id: expenseId }, include: { vendor: true } }),
    expenseFormOptions(),
  ]);
  if (!expense) notFound();
  if (expense.maintenanceId) redirect(`/maintenance`);
  if (expense.fuelRecordId) redirect(`/fuel`);

  return (
    <>
      <PageHeader title={`Edit ${expense.expenseNo}`} />
      <ExpenseForm
        action={saveExpenseAction.bind(null, expenseId)}
        {...options}
        expense={{ ...expense, vendorName: expense.vendor?.name ?? null }}
        defaults={{ date: todayKeyIST() }}
        cancelHref="/expenses"
      />
    </>
  );
}
