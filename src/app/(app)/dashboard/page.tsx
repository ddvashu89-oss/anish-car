import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarPlus,
  Car,
  CarFront,
  CircleDollarSign,
  Clock,
  FileText,
  KeyRound,
  ReceiptIndianRupee,
  RotateCcw,
  ScrollText,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Wallet,
  Wrench,
} from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { carPerformance, monthlySeries, periodSummary, resolvePeriod } from "@/lib/analytics";
import { addDays, endOfDayIST, startOfDayIST, todayDateOnly } from "@/lib/dates";
import { documentState } from "@/lib/documents";
import { formatRegistration, serviceHealth } from "@/lib/fleet";
import { getSettings, reminderDaysFor } from "@/lib/settings";
import { formatDateTime, formatMoney, formatShortDateTime, round2, toNum } from "@/lib/utils";
import { BarList } from "@/components/charts/bar-list";
import { CashflowChart } from "@/components/charts/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Dashboard · Anish Car Rent" };

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const canMoney = can(user, "payments.view");
  const canAnalytics = can(user, "analytics.view") || can(user, "expenses.view");

  const now = new Date();
  const dayStart = startOfDayIST(now);
  const dayEnd = endOfDayIST(now);
  const today = todayDateOnly();
  const month = resolvePeriod("this-month");
  const settings = await getSettings();

  const [
    carsByStatus,
    activeRentals,
    pickupsToday,
    returnsToday,
    overdue,
    todayCollection,
    open,
    docs,
    fleet,
    summary,
    series,
    carRows,
    recentActivity,
  ] = await Promise.all([
    prisma.car.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.booking.count({ where: { status: { in: ["HANDED_OVER", "RUNNING"] } } }),
    prisma.booking.findMany({
      where: { status: "CONFIRMED", pickupAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { pickupAt: "asc" },
      include: { customer: { select: { fullName: true } }, car: { select: { model: true, registrationNumber: true } } },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["RUNNING", "HANDED_OVER"] }, returnAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { returnAt: "asc" },
      include: { customer: { select: { fullName: true } }, car: { select: { model: true, registrationNumber: true } } },
    }),
    prisma.booking.count({ where: { status: { in: ["RUNNING", "HANDED_OVER"] }, returnAt: { lt: now } } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: dayStart, lte: dayEnd }, status: "SUCCESS", paymentType: { not: "SECURITY_DEPOSIT" } },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CANCELLED"] } },
      select: { status: true, totalAmount: true, paidAmount: true },
    }),
    prisma.carDocument.findMany({
      where: { expiryDate: { not: null, lte: addDays(today, 60) }, car: { status: { not: "INACTIVE" } } },
      select: { documentType: true, expiryDate: true },
    }),
    prisma.car.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { currentKm: true, serviceDueKm: true, nextServiceDate: true },
    }),
    canAnalytics ? periodSummary(month) : null,
    canAnalytics ? monthlySeries(6) : null,
    canAnalytics ? carPerformance(month) : null,
    prisma.auditLog.findMany({ take: 8, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }),
  ]);

  const countFor = (status: string) => carsByStatus.find((r) => r.status === status)?._count._all ?? 0;
  const totalCars = carsByStatus.filter((r) => r.status !== "INACTIVE").reduce((s, r) => s + r._count._all, 0);

  const pendingRows = open
    .map((b) => ({ status: b.status, due: round2(toNum(b.totalAmount) - toNum(b.paidAmount)) }))
    .filter((b) => b.due > 0.009);
  const pendingTotal = round2(pendingRows.reduce((s, b) => s + b.due, 0));
  const dueNowCount = pendingRows.filter((b) => b.status === "RETURNED").length;

  let docsExpired = 0;
  let docsExpiring = 0;
  for (const d of docs) {
    const st = documentState(d.expiryDate, today, reminderDaysFor(d.documentType, settings)).state;
    if (st === "EXPIRED") docsExpired++;
    else if (st === "URGENT" || st === "EXPIRING_SOON") docsExpiring++;
  }
  let serviceDue = 0;
  let serviceOverdue = 0;
  for (const car of fleet) {
    const h = serviceHealth(car, today, { km: settings.reminders.serviceKm, days: settings.reminders.serviceDays });
    if (h.state === "overdue") serviceOverdue++;
    else if (h.state === "due") serviceDue++;
  }

  const utilisation = totalCars > 0 ? Math.round(((countFor("RENTED")) / totalCars) * 100) : 0;

  const alerts = [
    { label: "Cars overdue for return", count: overdue, href: "/returns?tab=overdue", tone: "danger" as const, icon: Clock },
    { label: "Documents expired", count: docsExpired, href: "/documents", tone: "danger" as const, icon: ScrollText },
    { label: "Service overdue", count: serviceOverdue, href: "/maintenance?tab=fleet", tone: "danger" as const, icon: Wrench },
    { label: "Returned cars with money due", count: dueNowCount, href: "/payments?tab=pending", tone: "warning" as const, icon: ReceiptIndianRupee },
    { label: "Documents expiring soon", count: docsExpiring, href: "/documents", tone: "warning" as const, icon: AlertTriangle },
    { label: "Service due soon", count: serviceDue, href: "/maintenance?tab=fleet", tone: "warning" as const, icon: Wrench },
  ].filter((a) => a.count > 0);

  const quick = [
    { label: "New booking", href: "/bookings/new", icon: CalendarPlus, perm: "bookings.create" },
    { label: "Add customer", href: "/customers/new", icon: UserPlus, perm: "customers.create" },
    { label: "Add car", href: "/cars/new", icon: Car, perm: "cars.create" },
    { label: "Receive payment", href: "/payments/new", icon: ReceiptIndianRupee, perm: "payments.create" },
    { label: "Add expense", href: "/expenses/new", icon: TrendingDown, perm: "expenses.create" },
    { label: "Invoices", href: "/invoices", icon: FileText, perm: "invoices.view" },
  ].filter((q) => can(user, q.perm));

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(now)}
      />

      {quick.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {quick.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="card-shadow flex items-center gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <Icon className="size-4 shrink-0 text-primary" /> {label}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active fleet" value={totalCars} icon={Car} tone="primary" hint={`${countFor("AVAILABLE")} available · ${countFor("SERVICE")} in service`} />
        <StatCard label="Out on rent" value={activeRentals} icon={KeyRound} tone="info" hint={overdue ? `${overdue} overdue` : "None overdue"} />
        {canMoney ? (
          <>
            <StatCard label="Today's collection" value={formatMoney(todayCollection._sum.amount)} icon={Wallet} tone="success" />
            <StatCard label="Pending payments" value={formatMoney(pendingTotal)} icon={Clock} tone={pendingTotal > 0 ? "danger" : "neutral"} hint={`${pendingRows.length} booking${pendingRows.length === 1 ? "" : "s"}`} />
          </>
        ) : (
          <>
            <StatCard label="Pickups today" value={pickupsToday.length} icon={KeyRound} />
            <StatCard label="Returns today" value={returnsToday.length} icon={RotateCcw} />
          </>
        )}
      </section>

      {summary ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="This month collections" value={formatMoney(summary.collections)} icon={TrendingUp} tone="success" />
          <StatCard label="This month expenses" value={formatMoney(summary.expenses)} icon={TrendingDown} tone="warning" />
          <StatCard
            label={summary.profit >= 0 ? "This month profit" : "This month loss"}
            value={formatMoney(summary.profit)}
            icon={CircleDollarSign}
            tone={summary.profit >= 0 ? "success" : "danger"}
          />
          <StatCard label="Fleet utilisation now" value={`${utilisation}%`} icon={CarFront} hint={`${countFor("RENTED")} of ${totalCars} cars out`} />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pickups today</CardTitle>
            <span className="text-xs text-muted">{pickupsToday.length}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {pickupsToday.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No pickups scheduled.</p>
            ) : (
              pickupsToday.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/bookings/${b.id}`} className="min-w-0 hover:text-primary">
                    <span className="block truncate font-medium">{b.customer.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatShortDateTime(b.pickupAt)} · {b.car.model} {formatRegistration(b.car.registrationNumber)}
                    </span>
                  </Link>
                  {can(user, "returns.create") ? (
                    <LinkButton href={`/bookings/${b.id}/handover`} size="sm" variant="outline">
                      Hand over
                    </LinkButton>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Returns today</CardTitle>
            <span className="text-xs text-muted">{returnsToday.length}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {returnsToday.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No returns due today.</p>
            ) : (
              returnsToday.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/bookings/${b.id}`} className="min-w-0 hover:text-primary">
                    <span className="block truncate font-medium">{b.customer.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatShortDateTime(b.returnAt)} · {b.car.model} {formatRegistration(b.car.registrationNumber)}
                    </span>
                  </Link>
                  {can(user, "returns.create") ? (
                    <LinkButton href={`/bookings/${b.id}/return`} size="sm" variant="outline">
                      Receive
                    </LinkButton>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Nothing needs attention right now.</p>
            ) : (
              alerts.map(({ label, count, href, tone, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={tone === "danger" ? "size-4 text-danger" : "size-4 text-warning"} />
                    {label}
                  </span>
                  <span className="font-semibold tabular-nums">{count}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {series && carRows ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Collections vs expenses</CardTitle>
              <Link href="/analytics" className="text-xs font-medium text-primary hover:underline">
                Full analytics
              </Link>
            </CardHeader>
            <CardContent>
              <CashflowChart data={series} height={240} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top earning cars</CardTitle>
              <span className="text-xs text-muted">This month</span>
            </CardHeader>
            <CardContent>
              <BarList
                items={carRows
                  .filter((c) => c.revenue > 0)
                  .sort((a, b) => b.revenue - a.revenue)
                  .slice(0, 6)
                  .map((c) => ({
                    key: c.id,
                    label: c.name,
                    sub: formatRegistration(c.registrationNumber),
                    value: c.revenue,
                    display: formatMoney(c.revenue),
                    href: `/cars/${c.id}`,
                  }))}
                empty="No completed rentals this month yet."
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          {can(user, "audit.view") ? (
            <Link href="/audit" className="text-xs font-medium text-primary hover:underline">
              Audit log
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{entry.summary ?? entry.action}</span>
                    <span className="text-xs text-muted">{entry.user?.name ?? "System"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
