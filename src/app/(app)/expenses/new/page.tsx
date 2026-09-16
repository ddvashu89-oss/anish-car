import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { saveExpenseAction } from "@/lib/actions/expense-actions";
import { todayKeyIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { ExpenseForm } from "../expense-form";
import { expenseFormOptions } from "../options";

export const metadata: Metadata = { title: "Add expense · Anish Car Rent" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ carId?: string }> }) {
  await requirePermission("expenses.create");
  const carId = Number((await searchParams).carId) || undefined;
  const options = await expenseFormOptions();

  return (
    <>
      <PageHeader
        title="Add expense"
        description="Service and fuel have their own screens — they add the expense for you, so don't enter them twice."
      />
      <ExpenseForm
        action={saveExpenseAction.bind(null, null)}
        {...options}
        defaults={{ carId, date: todayKeyIST() }}
        cancelHref={carId ? `/cars/${carId}?tab=expenses` : "/expenses"}
        returnTo={carId ? "car" : undefined}
      />
    </>
  );
}
