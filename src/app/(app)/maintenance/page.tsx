import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip, Plus, Wrench } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayDateOnly } from "@/lib/dates";
import { daysLeftLabel } from "@/lib/documents";
import { formatRegistration, serviceHealth } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { CAR_STATUS_META, labelOf, MAINTENANCE_TYPE_OPTIONS } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import { formatDate, formatKm, formatMoney, formatNumber, qs, toNum } from "@/lib/utils";
import { deleteMaintenanceAction } from "@/lib/actions/maintenance-actions";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState, MiniStat } from "@/components/ui/display";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { carOptions } from "../documents/owners";

export const metadata: Metadata = { title: "Maintenance · Anish Car Rent" };

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; car?: string; type?: string; page?: string }>;
}) {
  const actor = await requirePermission("maintenance.view");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayDateOnly();
  const thresholds = { km: settings.reminders.serviceKm, days: settings.reminders.serviceDays };

  const fleet = await prisma.car.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: [{ company: "asc" }, { model: "asc" }],
    include: { maintenance: { orderBy: { serviceDate: "desc" }, take: 1 } },
  });
  const health = fleet
    .map((car) => ({ car, health: serviceHealth(car, today, thresholds) }))
    .sort((a, b) => {
      const rank = { overdue: 0, due: 1, unknown: 2, ok: 3 } as const;
      return rank[a.health.state] - rank[b.health.state] || (a.health.kmLeft ?? 1e9) - (b.health.kmLeft ?? 1e9);
    });
  const attention = health.filter((h) => h.health.state === "due" || h.health.state === "overdue").length;

  const tab = sp.tab === "history" ? "history" : sp.tab === "fleet" ? "fleet" : attention > 0 ? "fleet" : "history";
  const page = pageFrom(sp.page);

  const where: Prisma.MaintenanceWhereInput = {
    ...(Number(sp.car) ? { carId: Number(sp.car) } : {}),
    ...(MAINTENANCE_TYPE_OPTIONS.some((o) => o.value === sp.type) ? { serviceType: sp.type as never } : {}),
  };
  const [records, total, spend, cars] = await Promise.all([
    tab === "history"
      ? prisma.maintenance.findMany({
          where,
          orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { car: { select: { id: true, model: true, registrationNumber: true } }, parts: true },
        })
      : Promise.resolve([]),
    prisma.maintenance.count({ where }),
    prisma.maintenance.aggregate({ where, _sum: { totalCost: true } }),
    carOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Service health for every car, and the full repair history."
        actions={
          can(actor, "maintenance.create") ? (
            <LinkButton href="/maintenance/new">
              <Plus /> Log service
            </LinkButton>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Cars needing service" value={attention} tone={attention ? "danger" : "success"} />
        <MiniStat label="Service records" value={total} />
        <MiniStat label="Spent on maintenance" value={formatMoney(spend._sum.totalCost)} tone="warning" />
      </div>

      <Tabs
        active={tab}
        items={[
          { key: "fleet", label: "Service health", href: "/maintenance?tab=fleet", count: attention },
          { key: "history", label: "History", href: "/maintenance?tab=history", count: total },
        ]}
      />

      {tab === "fleet" ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Car</Th>
                <Th>Status</Th>
                <Th className="text-right">Odometer</Th>
                <Th className="text-right">Next service</Th>
                <Th>Health</Th>
                <Th>Last service</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {health.map(({ car, health: h }) => (
                <tr key={car.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/cars/${car.id}?tab=maintenance`} className="font-medium hover:text-primary">
                      {car.company} {car.model}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">{formatRegistration(car.registrationNumber)}</span>
                  </Td>
                  <Td>
                    <Badge tone={CAR_STATUS_META[car.status].tone}>{CAR_STATUS_META[car.status].label}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatKm(car.currentKm)}</Td>
                  <Td className="text-right text-xs tabular-nums">
                    {car.serviceDueKm != null ? formatKm(car.serviceDueKm) : "—"}
                    {h.kmLeft !== null ? (
                      <span className={`block ${h.kmLeft < 0 ? "text-danger" : "text-muted"}`}>
                        {h.kmLeft >= 0 ? `${formatNumber(h.kmLeft)} km left` : `${formatNumber(-h.kmLeft)} km over`}
                      </span>
                    ) : null}
                    {car.nextServiceDate ? (
                      <span className="block text-muted">
                        {formatDate(car.nextServiceDate)} ({daysLeftLabel(h.daysLeft)})
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={h.tone}>{h.label}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {car.maintenance[0] ? (
                      <>
                        {formatDate(car.maintenance[0].serviceDate)}
                        <span className="block text-muted">{formatKm(car.maintenance[0].km)}</span>
                      </>
                    ) : (
                      <span className="text-muted">Never</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {can(actor, "maintenance.create") ? (
                      <LinkButton href={`/maintenance/new?carId=${car.id}`} size="sm" variant={h.state === "overdue" ? "primary" : "outline"}>
                        <Wrench /> Log
                      </LinkButton>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <>
          <FilterBar action="/maintenance" resetHref="/maintenance?tab=history">
            <input type="hidden" name="tab" value="history" />
            <FilterSelect name="car" label="Car" defaultValue={sp.car} placeholder="All cars" options={cars} />
            <FilterSelect name="type" label="Type" defaultValue={sp.type} placeholder="All types" options={MAINTENANCE_TYPE_OPTIONS} />
          </FilterBar>
          <TableWrap>
            {records.length === 0 ? (
              <EmptyState icon={Wrench} title="No service records" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Car</Th>
                    <Th>Work</Th>
                    <Th className="text-right">Odometer</Th>
                    <Th className="text-right">Parts</Th>
                    <Th className="text-right">Labour</Th>
                    <Th className="text-right">Total</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((m) => (
                    <tr key={m.id} className="align-top hover:bg-surface-2/60">
                      <Td className="text-xs whitespace-nowrap">{formatDate(m.serviceDate)}</Td>
                      <Td>
                        <Link href={`/cars/${m.car.id}?tab=maintenance`} className="hover:text-primary">
                          {m.car.model}
                        </Link>
                        <span className="block font-mono text-[11px] text-muted">{formatRegistration(m.car.registrationNumber)}</span>
                      </Td>
                      <Td className="max-w-72 text-sm">
                        <span className="font-medium">{labelOf(MAINTENANCE_TYPE_OPTIONS, m.serviceType)}</span>
                        {m.garageName ? <span className="text-muted"> · {m.garageName}</span> : null}
                        {m.parts.length ? (
                          <span className="block text-xs text-muted">
                            {m.parts.map((p) => `${p.partName}${toNum(p.quantity) !== 1 ? ` ×${formatNumber(p.quantity)}` : ""}`).join(", ")}
                          </span>
                        ) : null}
                        {m.notes ? <span className="block text-xs text-muted">{m.notes}</span> : null}
                        {m.billUrl ? (
                          <a href={fileUrl(m.billUrl)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                            <Paperclip className="size-3" /> bill
                          </a>
                        ) : null}
                      </Td>
                      <Td className="text-right text-xs tabular-nums">{formatKm(m.km)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(m.partsCost)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(m.labourCost)}</Td>
                      <Td className="text-right font-medium tabular-nums">{formatMoney(m.totalCost)}</Td>
                      <Td className="text-right">
                        {can(actor, "maintenance.delete") ? (
                          <ActionButton
                            action={deleteMaintenanceAction}
                            fields={{ maintenanceId: m.id }}
                            confirm="Delete this service record and its expense?"
                            className="h-7 text-danger"
                          >
                            Delete
                          </ActionButton>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableWrap>
          <Pagination page={page} total={total} hrefFor={(p) => `/maintenance${qs({ tab: "history", car: sp.car, type: sp.type, page: p })}`} />
        </>
      )}
    </>
  );
}
