import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarRange, Download, Plus } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { balanceDue, BOOKING_STATUS_META } from "@/lib/bookings";
import { endOfDayIST, parseDateInput, startOfDayIST } from "@/lib/dates";
import { formatRegistration, normalizeRegistration } from "@/lib/fleet";
import { formatMoney, formatShortDateTime, qs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { FilterBar, FilterDate, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Bookings · Anish Car Rent" };

const TABS: Array<{ key: string; label: string; statuses?: BookingStatus[] }> = [
  { key: "active", label: "Upcoming & running", statuses: ["CONFIRMED", "HANDED_OVER", "RUNNING"] },
  { key: "quotation", label: "Quotations", statuses: ["DRAFT", "QUOTATION"] },
  { key: "returned", label: "Awaiting settlement", statuses: ["RETURNED"] },
  { key: "closed", label: "Closed", statuses: ["CLOSED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "all", label: "All" },
];

type Search = { tab?: string; q?: string; from?: string; to?: string; page?: string };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePermission("bookings.view");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const page = pageFrom(sp.page);
  const q = sp.q?.trim() ?? "";
  const from = sp.from ? parseDateInput(sp.from) : null;
  const to = sp.to ? parseDateInput(sp.to) : null;

  const filters: Prisma.BookingWhereInput = {
    ...(q
      ? {
          OR: [
            { bookingNumber: { contains: q } },
            { customer: { fullName: { contains: q } } },
            { customer: { mobile: { contains: q } } },
            { car: { registrationNumber: { contains: normalizeRegistration(q) || q } } },
            { car: { model: { contains: q } } },
          ],
        }
      : {}),
    // Anything that overlaps the chosen window.
    ...(from ? { returnAt: { gte: startOfDayIST(from) } } : {}),
    ...(to ? { pickupAt: { lte: endOfDayIST(to) } } : {}),
  };
  const where: Prisma.BookingWhereInput = { ...filters, ...(tab.statuses ? { status: { in: tab.statuses } } : {}) };

  const [bookings, total, counts] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: tab.key === "active" ? { pickupAt: "asc" } : { pickupAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true } },
        car: { select: { id: true, company: true, model: true, registrationNumber: true } },
      },
    }),
    prisma.booking.count({ where }),
    prisma.booking.groupBy({ by: ["status"], where: filters, _count: { _all: true } }),
  ]);

  const countFor = (statuses?: BookingStatus[]) =>
    counts.filter((c) => !statuses || statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const base = { q, from: sp.from, to: sp.to };
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every rental from quotation to closing."
        actions={
          <>
            <LinkButton href="/calendar" variant="outline">
              <CalendarRange /> Calendar
            </LinkButton>
            <LinkButton href={`/export/bookings${qs({ ...base, tab: tab.key })}`} variant="outline">
              <Download /> Export
            </LinkButton>
            {can(actor, "bookings.create") ? (
              <LinkButton href="/bookings/new">
                <Plus /> New booking
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Tabs
        active={tab.key}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: countFor(t.statuses),
          href: `/bookings${qs({ ...base, tab: t.key === "active" ? undefined : t.key })}`,
        }))}
      />

      <FilterBar action="/bookings" resetHref={`/bookings${qs({ tab: tab.key === "active" ? undefined : tab.key })}`}>
        {tab.key !== "active" ? <input type="hidden" name="tab" value={tab.key} /> : null}
        <SearchInput defaultValue={q} placeholder="Booking no., customer, mobile, car…" />
        <FilterDate name="from" label="From" defaultValue={sp.from} />
        <FilterDate name="to" label="To" defaultValue={sp.to} />
      </FilterBar>

      <TableWrap>
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings here"
            description={q || from || to ? "Try widening the filters." : "New bookings will show up here."}
            action={
              can(actor, "bookings.create") ? (
                <LinkButton href="/bookings/new">
                  <Plus /> New booking
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Car</Th>
                <Th>Pickup → Return</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const meta = BOOKING_STATUS_META[b.status];
                const due = balanceDue(b);
                const overdue = b.status === "RUNNING" && b.returnAt < now;
                return (
                  <tr key={b.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/bookings/${b.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {b.bookingNumber}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/customers/${b.customer.id}`} className="hover:text-primary">
                        {b.customer.fullName}
                      </Link>
                      <span className="block text-[11px] text-muted">{b.customer.mobile}</span>
                    </Td>
                    <Td>
                      <Link href={`/cars/${b.car.id}`} className="hover:text-primary">
                        {b.car.company} {b.car.model}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">{formatRegistration(b.car.registrationNumber)}</span>
                    </Td>
                    <Td className="text-xs whitespace-nowrap">
                      {formatShortDateTime(b.pickupAt)}
                      <span className={overdue ? "block font-medium text-danger" : "block text-muted"}>
                        → {formatShortDateTime(b.returnAt)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(b.totalAmount)}</Td>
                    <Td className="text-right tabular-nums">
                      {["DRAFT", "QUOTATION"].includes(b.status) ? (
                        <span className="text-muted">—</span>
                      ) : due > 0.009 ? (
                        <span className="font-medium text-danger">{formatMoney(due)}</span>
                      ) : due < -0.009 ? (
                        <span className="text-info">refund {formatMoney(-due)}</span>
                      ) : (
                        <span className="text-success">Paid</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>

      <Pagination
        page={page}
        total={total}
        hrefFor={(p) => `/bookings${qs({ ...base, tab: tab.key === "active" ? undefined : tab.key, page: p })}`}
      />
    </>
  );
}
