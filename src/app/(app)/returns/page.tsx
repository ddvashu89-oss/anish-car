import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, RotateCcw } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { balanceDue, BOOKING_STATUS_META } from "@/lib/bookings";
import { addDays, endOfDayIST, startOfDayIST } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { formatMoney, formatShortDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Returns & handovers · Anish Car Rent" };

type TabKey = "overdue" | "today" | "running" | "pickups" | "settle";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requirePermission("returns.view");
  const now = new Date();
  const dayEnd = endOfDayIST(now);

  const wheres: Record<TabKey, Prisma.BookingWhereInput> = {
    overdue: { status: { in: ["RUNNING", "HANDED_OVER"] }, returnAt: { lt: now } },
    today: { status: { in: ["RUNNING", "HANDED_OVER"] }, returnAt: { gte: now, lte: dayEnd } },
    running: { status: { in: ["RUNNING", "HANDED_OVER"] } },
    pickups: { status: "CONFIRMED", pickupAt: { gte: startOfDayIST(now), lte: endOfDayIST(addDays(now, 1)) } },
    settle: { status: "RETURNED" },
  };

  const requested = (await searchParams).tab as TabKey | undefined;
  const counts = await Promise.all(
    (Object.keys(wheres) as TabKey[]).map(async (k) => [k, await prisma.booking.count({ where: wheres[k] })] as const),
  );
  const countOf = Object.fromEntries(counts) as Record<TabKey, number>;
  const tab: TabKey =
    requested && requested in wheres ? requested : countOf.overdue > 0 ? "overdue" : countOf.today > 0 ? "today" : "running";

  const bookings = await prisma.booking.findMany({
    where: wheres[tab],
    orderBy: tab === "pickups" ? { pickupAt: "asc" } : { returnAt: "asc" },
    include: {
      customer: { select: { id: true, fullName: true, mobile: true } },
      car: { select: { id: true, company: true, model: true, registrationNumber: true } },
    },
  });

  const canAct = can(actor, "returns.create");

  return (
    <>
      <PageHeader title="Returns & handovers" description="The front desk: cars going out, cars coming back, and bills to settle." />

      <Tabs
        active={tab}
        items={[
          { key: "overdue", label: "Overdue", href: "/returns?tab=overdue", count: countOf.overdue },
          { key: "today", label: "Due today", href: "/returns?tab=today", count: countOf.today },
          { key: "running", label: "All out on rent", href: "/returns?tab=running", count: countOf.running },
          { key: "pickups", label: "Pickups today & tomorrow", href: "/returns?tab=pickups", count: countOf.pickups },
          { key: "settle", label: "Awaiting settlement", href: "/returns?tab=settle", count: countOf.settle },
        ]}
      />

      <TableWrap>
        {bookings.length === 0 ? (
          <EmptyState
            icon={tab === "pickups" ? KeyRound : RotateCcw}
            title="Nothing here"
            description={tab === "overdue" ? "No cars are overdue." : "Nothing needs attention in this list."}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Car</Th>
                <Th>Customer</Th>
                <Th>{tab === "pickups" ? "Pickup" : "Due back"}</Th>
                <Th>Booking</Th>
                <Th className="text-right">Balance</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const late = ["RUNNING", "HANDED_OVER"].includes(b.status) && b.returnAt < now;
                const hoursLate = late ? Math.floor((now.getTime() - b.returnAt.getTime()) / 3_600_000) : 0;
                const due = balanceDue(b);
                return (
                  <tr key={b.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/cars/${b.car.id}`} className="font-medium hover:text-primary">
                        {b.car.company} {b.car.model}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">{formatRegistration(b.car.registrationNumber)}</span>
                    </Td>
                    <Td>
                      <Link href={`/customers/${b.customer.id}`} className="hover:text-primary">
                        {b.customer.fullName}
                      </Link>
                      <a href={`tel:${b.customer.mobile}`} className="block text-[11px] text-muted hover:text-primary">
                        {b.customer.mobile}
                      </a>
                    </Td>
                    <Td className="text-sm whitespace-nowrap">
                      {formatShortDateTime(tab === "pickups" ? b.pickupAt : b.returnAt)}
                      {late ? (
                        <span className="block text-xs font-medium text-danger">
                          {hoursLate >= 24 ? `${Math.floor(hoursLate / 24)}d ${hoursLate % 24}h late` : `${hoursLate}h late`}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Link href={`/bookings/${b.id}`} className="font-mono text-xs text-primary hover:underline">
                        {b.bookingNumber}
                      </Link>
                      <Badge tone={BOOKING_STATUS_META[b.status].tone} className="ml-2">
                        {BOOKING_STATUS_META[b.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {due > 0.009 ? <span className="text-danger">{formatMoney(due)}</span> : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="text-right">
                      {!canAct ? null : tab === "pickups" ? (
                        <LinkButton href={`/bookings/${b.id}/handover`} size="sm">
                          <KeyRound /> Hand over
                        </LinkButton>
                      ) : tab === "settle" ? (
                        <LinkButton href={`/bookings/${b.id}`} size="sm" variant="outline">
                          Settle
                        </LinkButton>
                      ) : (
                        <LinkButton href={`/bookings/${b.id}/return`} size="sm">
                          <RotateCcw /> Receive
                        </LinkButton>
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
