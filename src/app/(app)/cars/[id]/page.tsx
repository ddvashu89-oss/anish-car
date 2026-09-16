import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarPlus,
  Car as CarIcon,
  FilePlus2,
  Fuel,
  Pencil,
  Receipt,
  Trash2,
  Wrench,
} from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOOKING_STATUS_META, balanceDue } from "@/lib/bookings";
import { addDays, todayDateOnly } from "@/lib/dates";
import { daysLeftLabel, DOC_STATE_META, documentState } from "@/lib/documents";
import { formatRegistration, serviceHealth, utilization } from "@/lib/fleet";
import { fuelEfficiency } from "@/lib/fuel";
import { getSettings, reminderDaysFor } from "@/lib/settings";
import { CAR_STATUS_META, labelOf, MAINTENANCE_TYPE_OPTIONS, PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import {
  formatDate,
  formatKm,
  formatMoney,
  formatNumber,
  formatShortDateTime,
  round2,
  titleCase,
  toNum,
} from "@/lib/utils";
import { deleteCarAction, setCarStatusAction } from "@/lib/actions/car-actions";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, EmptyState, MiniStat, Timeline } from "@/components/ui/display";
import { LinkButton, TextLink } from "@/components/ui/link-button";
import { EmptyRow, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { DocumentTable } from "../../documents/document-table";

export const metadata: Metadata = { title: "Car · Anish Car Rent" };

const TABS = ["overview", "bookings", "expenses", "maintenance", "fuel", "documents", "damage"] as const;
const EARNING = new Set(["RUNNING", "HANDED_OVER", "RETURNED", "CLOSED"]);

export default async function CarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePermission("cars.view");
  const carId = Number((await params).id);
  if (!Number.isInteger(carId)) notFound();
  const tabParam = (await searchParams).tab;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? tabParam! : "overview";

  const [car, settings] = await Promise.all([
    prisma.car.findUnique({
      where: { id: carId },
      include: {
        bookings: {
          orderBy: { pickupAt: "desc" },
          include: { customer: { select: { id: true, fullName: true, mobile: true } } },
        },
        expenses: { orderBy: { expenseDate: "desc" }, include: { category: true, vendor: true } },
        maintenance: { orderBy: { serviceDate: "desc" }, include: { parts: true } },
        fuelRecords: { orderBy: { filledAt: "desc" } },
        documents: { orderBy: { expiryDate: "asc" } },
        damageRecords: {
          orderBy: { recordedAt: "desc" },
          include: { booking: { select: { id: true, bookingNumber: true } } },
        },
      },
    }),
    getSettings(),
  ]);
  if (!car) notFound();

  const today = todayDateOnly();
  const now = new Date();
  const health = serviceHealth(car, today, { km: settings.reminders.serviceKm, days: settings.reminders.serviceDays });
  const statusMeta = CAR_STATUS_META[car.status];

  const earning = car.bookings.filter((b) => EARNING.has(b.status));
  const revenue = round2(earning.reduce((s, b) => s + toNum(b.totalAmount), 0));
  const collected = round2(earning.reduce((s, b) => s + toNum(b.paidAmount), 0));
  const expenses = round2(car.expenses.reduce((s, e) => s + toNum(e.amount), 0));
  const util30 = utilization(car.bookings, addDays(now, -30), now, now);
  const since = car.purchaseDate ?? car.createdAt;
  const utilLife = utilization(car.bookings, since, now, now);
  const kmDriven = car.bookings.reduce(
    (s, b) => s + (b.startingKm != null && b.endingKm != null ? Math.max(0, b.endingKm - b.startingKm) : 0),
    0,
  );
  const efficiency = fuelEfficiency(
    car.fuelRecords.map((f) => ({ id: f.id, km: f.km, litres: toNum(f.litres), amount: toNum(f.amount), isFullTank: f.isFullTank })),
  );

  const running = car.bookings.find((b) => b.status === "RUNNING" || b.status === "HANDED_OVER");
  const upcoming = car.bookings
    .filter((b) => b.status === "CONFIRMED" && b.pickupAt >= now)
    .sort((a, b) => a.pickupAt.getTime() - b.pickupAt.getTime());

  const expenseByCategory = new Map<string, number>();
  for (const e of car.expenses) {
    expenseByCategory.set(e.category.name, (expenseByCategory.get(e.category.name) ?? 0) + toNum(e.amount));
  }

  const tabHref = (t: string) => `/cars/${carId}${t === "overview" ? "" : `?tab=${t}`}`;
  const canEdit = can(actor, "cars.edit");

  const timeline = [
    ...car.bookings.slice(0, 20).flatMap((b) => {
      const items = [];
      if (b.actualPickupAt) items.push({ id: `bo${b.id}`, at: b.actualPickupAt, title: <>Out on <TextLink href={`/bookings/${b.id}`}>{b.bookingNumber}</TextLink> · {b.customer.fullName}</>, tone: "primary" });
      if (b.actualReturnAt) items.push({ id: `br${b.id}`, at: b.actualReturnAt, title: <>Returned from <TextLink href={`/bookings/${b.id}`}>{b.bookingNumber}</TextLink>{b.endingKm != null && b.startingKm != null ? ` · ${formatKm(b.endingKm - b.startingKm)}` : ""}</>, tone: "success" });
      return items;
    }),
    ...car.expenses.slice(0, 20).map((e) => ({
      id: `e${e.id}`,
      at: e.expenseDate,
      title: <>{e.category.name} · {formatMoney(e.amount)}</>,
      tone: "warning",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 12);

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            {car.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(car.primaryImageUrl)!} alt="" className="h-20 w-28 shrink-0 rounded-lg border border-line object-cover" />
            ) : (
              <span className="grid h-20 w-28 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                <CarIcon className="size-7" />
              </span>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {car.company} {car.model}
                  {car.variant ? <span className="font-normal text-muted"> {car.variant}</span> : null}
                </h1>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                <Badge tone={health.tone}>{health.label}</Badge>
              </div>
              <p className="font-mono text-sm">{formatRegistration(car.registrationNumber)}</p>
              <p className="text-xs text-muted">
                {[car.year, titleCase(car.fuelType), titleCase(car.transmission), car.seatingCapacity ? `${car.seatingCapacity} seats` : null, car.colour]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {running ? (
                <p className="text-xs">
                  Out with{" "}
                  <TextLink href={`/customers/${running.customer.id}`}>{running.customer.fullName}</TextLink> on{" "}
                  <TextLink href={`/bookings/${running.id}`}>{running.bookingNumber}</TextLink> · due{" "}
                  <span className={running.returnAt < now ? "font-medium text-danger" : ""}>
                    {formatShortDateTime(running.returnAt)}
                  </span>
                </p>
              ) : upcoming[0] ? (
                <p className="text-xs text-muted">
                  Next pickup {formatShortDateTime(upcoming[0].pickupAt)} ·{" "}
                  <TextLink href={`/bookings/${upcoming[0].id}`}>{upcoming[0].bookingNumber}</TextLink>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {can(actor, "bookings.create") && car.status !== "INACTIVE" ? (
              <LinkButton href={`/bookings/new?carId=${car.id}`} size="sm">
                <CalendarPlus /> Book
              </LinkButton>
            ) : null}
            {canEdit ? (
              <LinkButton href={`/cars/${car.id}/edit`} size="sm" variant="outline">
                <Pencil /> Edit
              </LinkButton>
            ) : null}
            {canEdit && car.status !== "RENTED"
              ? (["AVAILABLE", "SERVICE", "INACTIVE"] as const)
                  .filter((s) => s !== car.status)
                  .map((s) => (
                    <ActionButton
                      key={s}
                      action={setCarStatusAction}
                      fields={{ carId: car.id, status: s }}
                      variant="outline"
                      confirm={s === "INACTIVE" ? "Take this car out of the fleet? It won't appear for new bookings." : undefined}
                    >
                      {s === "AVAILABLE" ? "Mark available" : s === "SERVICE" ? "Send to service" : "Deactivate"}
                    </ActionButton>
                  ))
              : null}
            {can(actor, "cars.delete") ? (
              <ActionButton
                action={deleteCarAction}
                fields={{ carId: car.id }}
                confirm={`Delete ${car.registrationNumber}? This cannot be undone.`}
                className="text-danger"
              >
                <Trash2 /> Delete
              </ActionButton>
            ) : null}
          </div>
        </CardContent>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-5 sm:grid-cols-4 lg:grid-cols-8">
          <MiniStat label="Rentals" value={earning.length} />
          <MiniStat label="Revenue" value={formatMoney(revenue)} tone="success" />
          <MiniStat label="Collected" value={formatMoney(collected)} />
          <MiniStat label="Expenses" value={formatMoney(expenses)} tone="warning" />
          <MiniStat label="Net contribution" value={formatMoney(revenue - expenses)} tone={revenue - expenses >= 0 ? "success" : "danger"} />
          <MiniStat label="Utilisation (30d)" value={`${util30}%`} tone="primary" />
          <MiniStat label="Utilisation (lifetime)" value={`${utilLife}%`} />
          <MiniStat label="Odometer" value={formatKm(car.currentKm)} />
        </div>
      </Card>

      <Tabs
        active={tab}
        items={[
          { key: "overview", label: "Overview", href: tabHref("overview") },
          { key: "bookings", label: "Bookings", href: tabHref("bookings"), count: car.bookings.length },
          { key: "expenses", label: "Expenses", href: tabHref("expenses"), count: car.expenses.length },
          { key: "maintenance", label: "Maintenance", href: tabHref("maintenance"), count: car.maintenance.length },
          { key: "fuel", label: "Fuel", href: tabHref("fuel"), count: car.fuelRecords.length },
          { key: "documents", label: "Documents", href: tabHref("documents"), count: car.documents.length },
          { key: "damage", label: "Damage", href: tabHref("damage"), count: car.damageRecords.length },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <DetailList
                columns={3}
                items={[
                  { label: "Daily rate", value: formatMoney(car.dailyRate) },
                  { label: "Included km / day", value: car.includedKmPerDay > 0 ? formatKm(car.includedKmPerDay) : "Unlimited" },
                  { label: "Extra km rate", value: `${formatMoney(car.extraKmRate)}/km` },
                  { label: "Late fee", value: car.extraHourRate ? `${formatMoney(car.extraHourRate)}/hour` : `${formatMoney(settings.billing.lateFeePerHour)}/hour (default)` },
                  { label: "Security deposit", value: formatMoney(car.securityDeposit) },
                  { label: "Km driven on rentals", value: formatKm(kmDriven) },
                  { label: "Chassis no.", value: car.chassisNumber },
                  { label: "Engine no.", value: car.engineNumber },
                  { label: "Purchased", value: car.purchaseDate ? `${formatDate(car.purchaseDate)}${car.purchasePrice ? ` · ${formatMoney(car.purchasePrice)}` : ""}` : null },
                ]}
              />
              {car.notes ? <p className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{car.notes}</p> : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Service</CardTitle>
                <Badge tone={health.tone}>{health.label}</Badge>
              </CardHeader>
              <CardContent>
                <DetailList
                  columns={1}
                  items={[
                    { label: "Next service at", value: car.serviceDueKm != null ? `${formatKm(car.serviceDueKm)} (${health.kmLeft! >= 0 ? `${formatNumber(health.kmLeft)} km left` : `${formatNumber(-health.kmLeft!)} km over`})` : "Not set" },
                    { label: "Next service date", value: car.nextServiceDate ? `${formatDate(car.nextServiceDate)} (${daysLeftLabel(health.daysLeft)})` : "Not set" },
                    { label: "Last service", value: car.maintenance[0] ? `${formatDate(car.maintenance[0].serviceDate)} at ${formatKm(car.maintenance[0].km)}` : "None recorded" },
                    { label: "Mileage", value: efficiency.kmPerLitre ? `${efficiency.kmPerLitre} km/l · ${formatMoney(efficiency.costPerKm)}/km` : "Needs two full-tank fills" },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {car.documents.length === 0 ? (
                  <p className="text-sm text-muted">No documents recorded.</p>
                ) : (
                  car.documents.map((d) => {
                    const st = documentState(d.expiryDate, today, reminderDaysFor(d.documentType, settings));
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{d.documentType}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted">{formatDate(d.expiryDate)}</span>
                          <Badge tone={DOC_STATE_META[st.state].tone}>{DOC_STATE_META[st.state].label}</Badge>
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Life history</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Nothing has happened to this car yet.</p>
              ) : (
                <Timeline items={timeline.map((t) => ({ id: t.id, title: t.title, when: formatDate(t.at), tone: t.tone }))} />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "bookings" ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th className="text-right">Km</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {car.bookings.length === 0 ? (
                <EmptyRow colSpan={7}>No bookings yet.</EmptyRow>
              ) : (
                car.bookings.map((b) => {
                  const meta = BOOKING_STATUS_META[b.status];
                  const due = balanceDue(b);
                  return (
                    <tr key={b.id} className="hover:bg-surface-2/60">
                      <Td>
                        <TextLink href={`/bookings/${b.id}`} className="font-mono text-xs">{b.bookingNumber}</TextLink>
                      </Td>
                      <Td>
                        <Link href={`/customers/${b.customer.id}`} className="hover:text-primary">{b.customer.fullName}</Link>
                      </Td>
                      <Td className="text-xs">{formatShortDateTime(b.pickupAt)} → {formatShortDateTime(b.returnAt)}</Td>
                      <Td><Badge tone={meta.tone}>{meta.label}</Badge></Td>
                      <Td className="text-right text-xs tabular-nums">
                        {b.startingKm != null && b.endingKm != null ? formatKm(b.endingKm - b.startingKm) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums">{formatMoney(b.totalAmount)}</Td>
                      <Td className="text-right tabular-nums">
                        {b.status !== "CANCELLED" && due > 0.009 ? <span className="text-danger">{formatMoney(due)}</span> : <span className="text-muted">—</span>}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}

      {tab === "expenses" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[...expenseByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => (
                <Badge key={name} tone="neutral">{name}: {formatMoney(amount)}</Badge>
              ))}
            </div>
            {can(actor, "expenses.create") ? (
              <LinkButton href={`/expenses/new?carId=${car.id}`} size="sm"><Receipt /> Add expense</LinkButton>
            ) : null}
          </div>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Details</Th>
                  <Th>Paid via</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {car.expenses.length === 0 ? (
                  <EmptyRow colSpan={5}>No expenses recorded for this car.</EmptyRow>
                ) : (
                  car.expenses.map((e) => (
                    <tr key={e.id}>
                      <Td className="text-xs whitespace-nowrap">{formatDate(e.expenseDate)}</Td>
                      <Td>{e.category.name}</Td>
                      <Td className="text-sm">
                        {e.description ?? "—"}
                        {e.vendor ? <span className="block text-[11px] text-muted">{e.vendor.name}</span> : null}
                      </Td>
                      <Td className="text-xs">{labelOf(PAYMENT_MODE_OPTIONS, e.paymentMode)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(e.amount)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      ) : null}

      {tab === "maintenance" ? (
        <div className="space-y-3">
          {can(actor, "maintenance.create") ? (
            <div className="flex justify-end">
              <LinkButton href={`/maintenance/new?carId=${car.id}`} size="sm"><Wrench /> Log service</LinkButton>
            </div>
          ) : null}
          {car.maintenance.length === 0 ? (
            <Card><EmptyState icon={Wrench} title="No service history" description="Log a service to start tracking when the next one is due." /></Card>
          ) : (
            car.maintenance.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium">{labelOf(MAINTENANCE_TYPE_OPTIONS, m.serviceType)}</p>
                    <p className="text-xs text-muted">
                      {formatDate(m.serviceDate)} · {formatKm(m.km)}
                      {m.garageName ? ` · ${m.garageName}` : ""}
                    </p>
                    {m.parts.length > 0 ? (
                      <p className="text-xs">Parts: {m.parts.map((p) => `${p.partName}${toNum(p.quantity) !== 1 ? ` ×${formatNumber(p.quantity)}` : ""}`).join(", ")}</p>
                    ) : null}
                    {m.notes ? <p className="text-xs text-muted">{m.notes}</p> : null}
                    {m.nextServiceKm || m.nextServiceDate ? (
                      <p className="text-xs text-muted">
                        Next: {[m.nextServiceKm ? formatKm(m.nextServiceKm) : null, m.nextServiceDate ? formatDate(m.nextServiceDate) : null].filter(Boolean).join(" or ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold tabular-nums">{formatMoney(m.totalCost)}</p>
                    <p className="text-xs text-muted">Parts {formatMoney(m.partsCost)} · Labour {formatMoney(m.labourCost)}</p>
                    {m.billUrl ? <a href={fileUrl(m.billUrl)!} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View bill</a> : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === "fuel" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {efficiency.kmPerLitre
                ? <>Average <strong className="text-fg">{efficiency.kmPerLitre} km/l</strong> · <strong className="text-fg">{formatMoney(efficiency.costPerKm)}</strong> per km</>
                : "Mileage appears after two full-tank fills."}
            </p>
            {can(actor, "fuel.create") ? (
              <LinkButton href={`/fuel/new?carId=${car.id}`} size="sm"><Fuel /> Add fuel</LinkButton>
            ) : null}
          </div>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">Odometer</Th>
                  <Th className="text-right">Litres</Th>
                  <Th className="text-right">₹/litre</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Mileage</Th>
                  <Th>Station</Th>
                </tr>
              </thead>
              <tbody>
                {car.fuelRecords.length === 0 ? (
                  <EmptyRow colSpan={7}>No fuel entries.</EmptyRow>
                ) : (
                  car.fuelRecords.map((f) => {
                    const eff = efficiency.perFill.get(f.id);
                    return (
                      <tr key={f.id}>
                        <Td className="text-xs">{formatDate(f.filledAt)}</Td>
                        <Td className="text-right tabular-nums">{formatKm(f.km)}</Td>
                        <Td className="text-right tabular-nums">{formatNumber(f.litres)}{f.isFullTank ? "" : " (part)"}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(f.pricePerLitre)}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(f.amount)}</Td>
                        <Td className="text-right text-xs tabular-nums">{eff ? `${eff.kmPerLitre} km/l` : "—"}</Td>
                        <Td className="text-xs">{f.station ?? "—"}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-3">
          {can(actor, "documents.create") ? (
            <div className="flex justify-end">
              <LinkButton href={`/documents/new?carId=${car.id}`} size="sm"><FilePlus2 /> Add document</LinkButton>
            </div>
          ) : null}
          <DocumentTable
            rows={car.documents.map((d) => ({
              id: d.id,
              kind: "car" as const,
              documentType: d.documentType,
              documentNumber: d.documentNumber,
              issueDate: d.issueDate,
              expiryDate: d.expiryDate,
              fileUrl: d.fileUrl,
              notes: [d.issuedBy, d.amount ? formatMoney(d.amount) : null, d.notes].filter(Boolean).join(" · ") || null,
            }))}
            windowFor={(t) => reminderDaysFor(t, settings)}
            canEdit={can(actor, "documents.edit")}
            canDelete={can(actor, "documents.delete")}
            emptyText="Add the RC, insurance and PUC so you get reminded before they expire."
          />
        </div>
      ) : null}

      {tab === "damage" ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Recorded</Th>
                <Th>Panel</Th>
                <Th>Severity</Th>
                <Th>Details</Th>
                <Th>Booking</Th>
                <Th className="text-right">Charged</Th>
              </tr>
            </thead>
            <tbody>
              {car.damageRecords.length === 0 ? (
                <EmptyRow colSpan={6}>No damage recorded.</EmptyRow>
              ) : (
                car.damageRecords.map((d) => (
                  <tr key={d.id}>
                    <Td className="text-xs">{formatDate(d.recordedAt)}</Td>
                    <Td>{d.panel}</Td>
                    <Td><Badge tone={d.severity === "MAJOR" ? "danger" : d.severity === "MODERATE" ? "warning" : "neutral"}>{d.severity.toLowerCase()}</Badge></Td>
                    <Td className="text-sm">
                      {d.description ?? "—"}
                      {d.photoUrl ? <a href={fileUrl(d.photoUrl)!} target="_blank" rel="noreferrer" className="ml-2 text-xs text-primary hover:underline">Photo</a> : null}
                    </Td>
                    <Td>{d.booking ? <TextLink href={`/bookings/${d.booking.id}`} className="font-mono text-xs">{d.booking.bookingNumber}</TextLink> : "—"}</Td>
                    <Td className="text-right tabular-nums">{d.chargeAmount ? formatMoney(d.chargeAmount) : "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}
    </>
  );
}
