import type { Metadata } from "next";
import Link from "next/link";
import { Download, Paperclip, Plus, TrendingDown } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateKeyIST, endOfMonthIST, parseDateInput, startOfMonthIST } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { labelOf, PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import { cn, formatDate, formatMoney, qs, round2, toNum } from "@/lib/utils";
import { addCategoryAction, deleteCategoryAction, deleteExpenseAction } from "@/lib/actions/expense-actions";
import { ActionButton, ActionForm, FInput, SubmitButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, MiniStat } from "@/components/ui/display";
import { FilterBar, FilterDate, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { carOptions } from "../documents/owners";

export const metadata: Metadata = { title: "Expenses · Anish Car Rent" };

type Search = { q?: string; from?: string; to?: string; category?: string; car?: string; page?: string };

function presets() {
  const now = new Date();
  const month = (offset: number) => ({
    from: dateKeyIST(startOfMonthIST(now, offset)),
    to: dateKeyIST(endOfMonthIST(now, offset)),
  });
  const year = dateKeyIST(now).slice(0, 4);
  return [
    { label: "This month", ...month(0) },
    { label: "Last month", ...month(-1) },
    { label: "This year", from: `${year}-01-01`, to: `${year}-12-31` },
    { label: "All time", from: "all", to: "" },
  ];
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePermission("expenses.view");
  const sp = await searchParams;
  const page = pageFrom(sp.page);
  const q = sp.q?.trim() ?? "";
  const ranges = presets();

  // No dates in the URL means "this month"; from=all means no date limit.
  const allTime = sp.from === "all";
  const fromKey = allTime ? "all" : (sp.from ?? (sp.to ? "" : ranges[0].from));
  const toKey = allTime ? "" : (sp.to ?? (sp.from ? "" : ranges[0].to));
  const from = !allTime && fromKey ? parseDateInput(fromKey) : null;
  const to = toKey ? parseDateInput(toKey) : null;

  const where: Prisma.ExpenseWhereInput = {
    ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(Number(sp.category) ? { categoryId: Number(sp.category) } : {}),
    ...(sp.car === "none" ? { carId: null } : Number(sp.car) ? { carId: Number(sp.car) } : {}),
    ...(q
      ? {
          OR: [
            { expenseNo: { contains: q } },
            { description: { contains: q } },
            { referenceNo: { contains: q } },
            { vendor: { name: { contains: q } } },
          ],
        }
      : {}),
  };

  const [expenses, total, sum, byCategory, categories, cars] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: true,
        vendor: true,
        car: { select: { id: true, model: true, registrationNumber: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { expenses: true } } } }),
    carOptions(),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const totalAmount = toNum(sum._sum.amount);
  const breakdown = byCategory
    .map((r) => ({ name: catName.get(r.categoryId) ?? "?", amount: toNum(r._sum.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const base = { q, category: sp.category, car: sp.car };
  const rangeParams = { from: fromKey || (toKey ? undefined : "all"), to: toKey || undefined };
  const activePreset = ranges.find((r) => r.from === fromKey && r.to === toKey)?.label;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Everything the business spends, linked to the car it was for."
        actions={
          <>
            {can(actor, "expenses.export") ? (
              <LinkButton href={`/export/expenses${qs({ ...base, ...rangeParams })}`} variant="outline">
                <Download /> Export
              </LinkButton>
            ) : null}
            {can(actor, "expenses.create") ? (
              <LinkButton href="/expenses/new">
                <Plus /> Add expense
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {ranges.map((r) => (
          <Link
            key={r.label}
            href={`/expenses${qs({ ...base, from: r.from, to: r.to, page: undefined })}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              activePreset === r.label ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:text-fg",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label={activePreset ?? "Selected period"} value={formatMoney(totalAmount)} tone="warning" />
        {breakdown.slice(0, 3).map((b) => (
          <MiniStat key={b.name} label={`${b.name} · ${totalAmount ? Math.round((b.amount / totalAmount) * 100) : 0}%`} value={formatMoney(b.amount)} />
        ))}
      </div>

      <FilterBar action="/expenses" resetHref="/expenses">
        <SearchInput defaultValue={q} placeholder="Description, vendor, bill no.…" />
        <FilterDate name="from" label="From" defaultValue={fromKey === "all" ? "" : fromKey} />
        <FilterDate name="to" label="To" defaultValue={toKey} />
        <FilterSelect
          name="category"
          label="Category"
          defaultValue={sp.category}
          placeholder="All categories"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          name="car"
          label="Car"
          defaultValue={sp.car}
          placeholder="All cars"
          options={[{ value: "none", label: "General (no car)" }, ...cars]}
        />
      </FilterBar>

      <TableWrap>
        {expenses.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No expenses in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Details</Th>
                <Th>Car</Th>
                <Th>Paid via</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const linked = e.maintenanceId ? "service" : e.fuelRecordId ? "fuel" : null;
                return (
                  <tr key={e.id} className="hover:bg-surface-2/60">
                    <Td className="text-xs whitespace-nowrap">
                      {formatDate(e.expenseDate)}
                      <span className="block font-mono text-[10px] text-muted">{e.expenseNo}</span>
                    </Td>
                    <Td>
                      <Badge>{e.category.name}</Badge>
                    </Td>
                    <Td className="max-w-72 text-sm">
                      {e.description ?? "—"}
                      <span className="block text-[11px] text-muted">
                        {[e.vendor?.name, e.createdBy?.name].filter(Boolean).join(" · ")}
                        {e.billUrl ? (
                          <a href={fileUrl(e.billUrl)!} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary hover:underline">
                            <Paperclip className="size-3" /> bill
                          </a>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      {e.car ? (
                        <Link href={`/cars/${e.car.id}?tab=expenses`} className="hover:text-primary">
                          {e.car.model}
                          <span className="block font-mono text-[10px] text-muted">{formatRegistration(e.car.registrationNumber)}</span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">General</span>
                      )}
                    </Td>
                    <Td className="text-xs">{labelOf(PAYMENT_MODE_OPTIONS, e.paymentMode)}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatMoney(e.amount)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {linked ? (
                          <Link href={linked === "service" ? "/maintenance" : "/fuel"} className="text-xs text-muted hover:text-primary">
                            from {linked}
                          </Link>
                        ) : (
                          <>
                            {can(actor, "expenses.edit") ? (
                              <Link href={`/expenses/${e.id}/edit`} className="px-2 text-xs font-medium text-primary hover:underline">
                                Edit
                              </Link>
                            ) : null}
                            {can(actor, "expenses.delete") ? (
                              <ActionButton
                                action={deleteExpenseAction}
                                fields={{ expenseId: e.id }}
                                confirm={`Delete ${e.expenseNo} (${formatMoney(e.amount)})?`}
                                className="h-7 text-danger"
                              >
                                Delete
                              </ActionButton>
                            ) : null}
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination page={page} total={total} hrefFor={(p) => `/expenses${qs({ ...base, ...rangeParams, page: p })}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <span className="text-xs text-muted">{activePreset ?? "Selected period"}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakdown.length === 0 ? (
              <p className="text-sm text-muted">Nothing to show.</p>
            ) : (
              breakdown.map((b) => (
                <div key={b.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{b.name}</span>
                    <span className="tabular-nums">{formatMoney(b.amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-1.5 rounded-full bg-warning"
                      style={{ width: `${totalAmount ? round2((b.amount / totalAmount) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {can(actor, "expenses.create") ? (
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActionForm action={addCategoryAction} className="flex items-start gap-2 space-y-0">
                <div className="flex-1">
                  <FInput name="name" placeholder="New category name" />
                </div>
                <SubmitButton size="md" variant="outline">
                  Add
                </SubmitButton>
              </ActionForm>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-2.5 text-xs">
                    {c.name}
                    <span className="text-muted">({c._count.expenses})</span>
                    {!c.isSystem && c._count.expenses === 0 && can(actor, "expenses.delete") ? (
                      <ActionButton action={deleteCategoryAction} fields={{ categoryId: c.id }} className="h-5 px-1.5 text-danger">
                        ×
                      </ActionButton>
                    ) : null}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
