import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  carPerformance,
  monthlySeries,
  PERIOD_PRESETS,
  periodSummary,
  repeatRate,
  resolvePeriod,
  topCustomers,
} from "@/lib/analytics";
import { formatRegistration } from "@/lib/fleet";
import { labelOf, PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { cn, formatKm, formatMoney, qs, round2, toNum } from "@/lib/utils";
import { BarList } from "@/components/charts/bar-list";
import { CashflowChart, TrendChart } from "@/components/charts/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniStat } from "@/components/ui/display";
import { FilterBar, FilterDate } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { BarChart3, CarFront, CircleDollarSign, TrendingDown, TrendingUp, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Analytics · Anish Car Rent" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const actor = await requirePermission("analytics.view");
  const sp = await searchParams;
  const period = resolvePeriod(sp.period, sp.from, sp.to);

  const [summary, series, cars, customers, repeat, receivable] = await Promise.all([
    periodSummary(period),
    monthlySeries(12),
    carPerformance(period),
    topCustomers(period),
    repeatRate(),
    prisma.booking.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: { status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CANCELLED"] } },
    }),
  ]);

  const activeCars = cars.filter((c) => c.status !== "INACTIVE");
  const fleetUtil = activeCars.length ? Math.round(activeCars.reduce((s, c) => s + c.utilization, 0) / activeCars.length) : 0;
  const revenuePerCar = activeCars.length ? round2(summary.billed / activeCars.length) : 0;
  const pending = round2(toNum(receivable._sum.totalAmount) - toNum(receivable._sum.paidAmount));

  const pick = <T,>(list: T[], score: (x: T) => number, dir: 1 | -1) =>
    list.length ? [...list].sort((a, b) => dir * (score(b) - score(a)))[0] : undefined;
  const mostRented = pick(activeCars.filter((c) => c.rentals > 0), (c) => c.rentals, 1);
  const topRevenue = pick(activeCars.filter((c) => c.revenue > 0), (c) => c.revenue, 1);
  const topExpense = pick(activeCars.filter((c) => c.expenses > 0), (c) => c.expenses, 1);
  const lowestUtil = pick(activeCars, (c) => c.utilization, -1);
  const topCustomer = pick(customers, (c) => c.rentals, 1);

  const presetHref = (key: string) => `/analytics${qs({ period: key === "this-month" ? undefined : key })}`;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`What's driving the business · ${period.label}`}
        actions={
          can(actor, "reports.export") ? (
            <>
              <LinkButton href={`/export/car-profit${qs({ from: period.fromKey, to: period.toKey })}`} variant="outline">
                <Download /> Car P&amp;L
              </LinkButton>
              <LinkButton href="/export/monthly" variant="outline">
                <Download /> Monthly P&amp;L
              </LinkButton>
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={presetHref(p.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                period.key === p.key ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:text-fg",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <FilterBar action="/analytics" resetHref="/analytics">
          <FilterDate name="from" label="From" defaultValue={period.fromKey} />
          <FilterDate name="to" label="To" defaultValue={period.toKey} />
        </FilterBar>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collections" value={formatMoney(summary.collections)} icon={Wallet} tone="success" hint="Rental payments received, net of refunds" />
        <StatCard label="Expenses" value={formatMoney(summary.expenses)} icon={TrendingDown} tone="warning" />
        <StatCard
          label={summary.profit >= 0 ? "Net profit" : "Net loss"}
          value={formatMoney(summary.profit)}
          icon={CircleDollarSign}
          tone={summary.profit >= 0 ? "success" : "danger"}
          hint={summary.margin !== null ? `${summary.margin}% margin` : undefined}
        />
        <StatCard label="Billed (completed rentals)" value={formatMoney(summary.billed)} icon={TrendingUp} tone="primary" hint={`${summary.completedRentals} rentals`} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="Fleet utilisation" value={`${fleetUtil}%`} tone="primary" />
        <MiniStat label="Average rental" value={formatMoney(summary.averageRental)} />
        <MiniStat label="Revenue per car" value={formatMoney(revenuePerCar)} />
        <MiniStat label="Pending receivables" value={formatMoney(pending)} tone={pending > 0 ? "danger" : undefined} />
        <MiniStat label="Repeat customers" value={`${repeat.rate}% (${repeat.repeat}/${repeat.customers})`} />
        <MiniStat label="Deposits collected" value={formatMoney(summary.depositsCollected)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Collections vs expenses — last 12 months</CardTitle>
        </CardHeader>
        <CardContent>
          <CashflowChart data={series} />
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-primary">Show as table</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th className="text-right">Collections</Th>
                    <Th className="text-right">Expenses</Th>
                    <Th className="text-right">Profit</Th>
                    <Th className="text-right">Billed</Th>
                    <Th className="text-right">Bookings</Th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((m) => (
                    <tr key={m.month}>
                      <Td>{m.label}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(m.collections)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(m.expenses)}</Td>
                      <Td className={cn("text-right font-medium tabular-nums", m.profit < 0 && "text-danger")}>{formatMoney(m.profit)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(m.billed)}</Td>
                      <Td className="text-right tabular-nums">{m.bookings}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Highlights</CardTitle>
            <span className="text-xs text-muted">{period.label}</span>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Most rented car", value: mostRented ? `${mostRented.name} · ${mostRented.rentals} rentals` : "—", href: mostRented && `/cars/${mostRented.id}` },
              { label: "Highest revenue car", value: topRevenue ? `${topRevenue.name} · ${formatMoney(topRevenue.revenue)}` : "—", href: topRevenue && `/cars/${topRevenue.id}` },
              { label: "Highest expense car", value: topExpense ? `${topExpense.name} · ${formatMoney(topExpense.expenses)}` : "—", href: topExpense && `/cars/${topExpense.id}` },
              { label: "Lowest utilisation", value: lowestUtil ? `${lowestUtil.name} · ${lowestUtil.utilization}%` : "—", href: lowestUtil && `/cars/${lowestUtil.id}` },
              { label: "Most frequent customer", value: topCustomer ? `${topCustomer.name} · ${topCustomer.rentals} rentals` : "—", href: topCustomer && `/customers/${topCustomer.id}` },
            ].map((h) => (
              <div key={h.label}>
                <p className="text-xs text-muted">{h.label}</p>
                {h.href ? (
                  <Link href={h.href} className="font-medium hover:text-primary">
                    {h.value}
                  </Link>
                ) : (
                  <p className="font-medium">{h.value}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Utilisation by car</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              max={100}
              items={[...activeCars]
                .sort((a, b) => b.utilization - a.utilization)
                .map((c) => ({
                  key: c.id,
                  label: c.name,
                  sub: formatRegistration(c.registrationNumber),
                  value: c.utilization,
                  display: `${c.utilization}%`,
                  href: `/cars/${c.id}`,
                }))}
              empty="No cars yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookings per month</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={series} dataKey="bookings" label="Bookings" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Car profitability</CardTitle>
          <span className="text-xs text-muted">Revenue from rentals that ended in the period, minus that car&apos;s expenses</span>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <thead>
              <tr>
                <Th>Car</Th>
                <Th className="text-right">Rentals</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Expenses</Th>
                <Th className="text-right">Contribution</Th>
                <Th className="text-right">Utilisation</Th>
                <Th className="text-right">Km</Th>
                <Th className="text-right">₹ / km</Th>
              </tr>
            </thead>
            <tbody>
              {cars.length === 0 ? (
                <tr>
                  <Td colSpan={8} className="py-8 text-center text-muted">
                    No cars yet.
                  </Td>
                </tr>
              ) : (
                cars.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/cars/${c.id}`} className="font-medium hover:text-primary">
                        {c.name}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">{formatRegistration(c.registrationNumber)}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{c.rentals}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(c.revenue)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(c.expenses)}</Td>
                    <Td className={cn("text-right font-semibold tabular-nums", c.profit < 0 ? "text-danger" : "text-success")}>
                      {formatMoney(c.profit)}
                    </Td>
                    <Td className="text-right tabular-nums">{c.utilization}%</Td>
                    <Td className="text-right tabular-nums">{formatKm(c.km)}</Td>
                    <Td className="text-right tabular-nums">{c.revenuePerKm !== null ? formatMoney(c.revenuePerKm) : "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              color="var(--series-2)"
              items={summary.expenseByCategory.map((e) => ({
                key: e.name,
                label: e.name,
                value: e.amount,
                display: `${formatMoney(e.amount)} · ${summary.expenses ? Math.round((e.amount / summary.expenses) * 100) : 0}%`,
              }))}
              empty="No expenses in this period."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collections by mode</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={summary.collectionsByMode.map((m) => ({
                key: m.mode,
                label: labelOf(PAYMENT_MODE_OPTIONS, m.mode),
                value: m.amount,
                display: formatMoney(m.amount),
              }))}
              empty="No collections in this period."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={customers.map((c) => ({
                key: c.id,
                label: c.name,
                sub: `${c.rentals}×`,
                value: c.billed,
                display: formatMoney(c.billed),
                href: `/customers/${c.id}`,
              }))}
              empty="No completed rentals in this period."
            />
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted">
        <BarChart3 className="size-3.5" />
        Collections are cash received; revenue and billed figures count rentals by the day the car came back.
        <CarFront className="size-3.5" /> Utilisation is time on rent ÷ time in the period.
      </p>
    </>
  );
}
