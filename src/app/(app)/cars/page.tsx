import type { Metadata } from "next";
import Link from "next/link";
import { Car as CarIcon, Download, Plus } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, todayDateOnly } from "@/lib/dates";
import { formatRegistration, normalizeRegistration, serviceHealth } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { CAR_STATUS_META } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import { formatKm, formatMoney, formatShortDateTime, qs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Fleet · Anish Car Rent" };

const STATUSES = ["AVAILABLE", "RENTED", "SERVICE", "INACTIVE"] as const;

export default async function CarsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const actor = await requirePermission("cars.view");
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const q = sp.q?.trim() ?? "";
  const settings = await getSettings();
  const today = todayDateOnly();

  const where: Prisma.CarWhereInput = {
    ...(status ? { status } : { status: { not: "INACTIVE" } }),
    ...(q
      ? {
          OR: [
            { registrationNumber: { contains: normalizeRegistration(q) || q } },
            { company: { contains: q } },
            { model: { contains: q } },
            { variant: { contains: q } },
          ],
        }
      : {}),
  };

  const [cars, counts] = await Promise.all([
    prisma.car.findMany({
      where,
      orderBy: [{ company: "asc" }, { model: "asc" }],
      include: {
        bookings: {
          where: { status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING"] } },
          orderBy: { pickupAt: "asc" },
          take: 2,
          select: { id: true, status: true, pickupAt: true, returnAt: true, bookingNumber: true, customer: { select: { fullName: true } } },
        },
        documents: {
          where: { expiryDate: { lte: addDays(today, 30) } },
          select: { id: true },
        },
      },
    }),
    prisma.car.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const activeTotal = counts.filter((c) => c.status !== "INACTIVE").reduce((sum, c) => sum + c._count._all, 0);
  const tabHref = (s?: string) => `/cars${qs({ status: s, q })}`;

  return (
    <>
      <PageHeader
        title="Fleet"
        description="Every car, where it is, and what it needs next."
        actions={
          <>
            {can(actor, "cars.export") ? (
              <LinkButton href="/export/cars" variant="outline">
                <Download /> Export
              </LinkButton>
            ) : null}
            {can(actor, "cars.create") ? (
              <LinkButton href="/cars/new">
                <Plus /> Add car
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Tabs
        active={status ?? "all"}
        items={[
          { key: "all", label: "Active fleet", href: tabHref(), count: activeTotal },
          ...STATUSES.map((s) => ({ key: s, label: CAR_STATUS_META[s].label, href: tabHref(s), count: countOf(s) })),
        ]}
      />

      <FilterBar action="/cars" resetHref={tabHref(status)}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <SearchInput defaultValue={q} placeholder="Registration, make, model…" />
      </FilterBar>

      <TableWrap>
        {cars.length === 0 ? (
          <EmptyState
            icon={CarIcon}
            title={q || status ? "No cars match" : "No cars yet"}
            description={q || status ? "Try another filter." : "Add your first car to start renting."}
            action={
              !q && !status && can(actor, "cars.create") ? (
                <LinkButton href="/cars/new">
                  <Plus /> Add car
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Car</Th>
                <Th>Status</Th>
                <Th>Now / next</Th>
                <Th className="text-right">Daily rate</Th>
                <Th className="text-right">Odometer</Th>
                <Th>Service</Th>
                <Th>Docs</Th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => {
                const meta = CAR_STATUS_META[car.status];
                const health = serviceHealth(car, today, { km: settings.reminders.serviceKm, days: settings.reminders.serviceDays });
                const running = car.bookings.find((b) => b.status === "RUNNING" || b.status === "HANDED_OVER");
                const next = car.bookings.find((b) => b.status === "CONFIRMED");
                const overdue = running && running.returnAt < new Date();
                return (
                  <tr key={car.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/cars/${car.id}`} className="flex items-center gap-3">
                        {car.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fileUrl(car.primaryImageUrl)!} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
                        ) : (
                          <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
                            <CarIcon className="size-4" />
                          </span>
                        )}
                        <span>
                          <span className="block font-medium hover:text-primary">
                            {car.company} {car.model}
                            {car.variant ? <span className="font-normal text-muted"> {car.variant}</span> : null}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">{formatRegistration(car.registrationNumber)}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="text-xs">
                      {running ? (
                        <Link href={`/bookings/${running.id}`} className="hover:text-primary">
                          <span className="block">{running.customer.fullName}</span>
                          <span className={overdue ? "text-danger" : "text-muted"}>
                            {overdue ? "Overdue since " : "Back "}
                            {formatShortDateTime(running.returnAt)}
                          </span>
                        </Link>
                      ) : next ? (
                        <Link href={`/bookings/${next.id}`} className="hover:text-primary">
                          <span className="block text-muted">Next pickup</span>
                          {formatShortDateTime(next.pickupAt)}
                        </Link>
                      ) : (
                        <span className="text-muted">Free</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(car.dailyRate)}</Td>
                    <Td className="text-right tabular-nums">{formatKm(car.currentKm)}</Td>
                    <Td>
                      <Badge tone={health.tone}>{health.state === "unknown" ? "—" : health.label}</Badge>
                    </Td>
                    <Td>
                      {car.documents.length > 0 ? (
                        <Badge tone="warning">{car.documents.length} expiring</Badge>
                      ) : (
                        <span className="text-xs text-muted">OK</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </>
  );
}
