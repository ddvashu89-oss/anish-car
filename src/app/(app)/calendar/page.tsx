import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOOKING_STATUS_META } from "@/lib/bookings";
import { addDays, dateKeyIST, endOfMonthIST, startOfMonthIST, todayKeyIST, toDateTimeInput } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { CAR_STATUS_META } from "@/lib/status";
import { cn, formatShortDateTime, qs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Calendar · Anish Car Rent" };

const DAY_MS = 86_400_000;

const BAR = {
  CONFIRMED: "bg-info/80 text-white",
  HANDED_OVER: "bg-primary text-primary-fg",
  RUNNING: "bg-primary text-primary-fg",
  RETURNED: "bg-warning/80 text-white",
  CLOSED: "bg-success/70 text-white",
  QUOTATION: "bg-muted/40 text-fg",
  DRAFT: "bg-muted/40 text-fg",
  CANCELLED: "bg-danger/40 text-fg",
} as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requirePermission("bookings.view");
  const { month } = await searchParams;

  const anchor = /^\d{4}-\d{2}$/.test(month ?? "") ? new Date(`${month}-15T00:00:00+05:30`) : new Date();
  const start = startOfMonthIST(anchor);
  const end = endOfMonthIST(anchor);
  const days = Math.round((end.getTime() + 1 - start.getTime()) / DAY_MS);
  const monthKey = dateKeyIST(start).slice(0, 7);
  const prev = dateKeyIST(startOfMonthIST(anchor, -1)).slice(0, 7);
  const next = dateKeyIST(startOfMonthIST(anchor, 1)).slice(0, 7);
  const todayKey = todayKeyIST();
  const now = new Date();

  const [cars, bookings] = await Promise.all([
    prisma.car.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: [{ company: "asc" }, { model: "asc" }],
      select: { id: true, company: true, model: true, registrationNumber: true, status: true },
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ["QUOTATION", "CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED"] },
        pickupAt: { lte: end },
        OR: [{ returnAt: { gte: start } }, { actualReturnAt: { gte: start } }, { status: "RUNNING" }],
      },
      select: {
        id: true,
        bookingNumber: true,
        carId: true,
        status: true,
        pickupAt: true,
        returnAt: true,
        actualPickupAt: true,
        actualReturnAt: true,
        customer: { select: { fullName: true } },
      },
    }),
  ]);

  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(start);
  const dayNumbers = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = dateKeyIST(d);
    const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "narrow", timeZone: "Asia/Kolkata" }).format(d);
    return { key, day: Number(key.slice(8)), weekday, weekend: weekday === "S" };
  });

  // Position a booking as a fraction of the month so partial days render accurately.
  const place = (from: Date, to: Date) => {
    const left = Math.max(0, (from.getTime() - start.getTime()) / DAY_MS);
    const right = Math.min(days, (to.getTime() - start.getTime()) / DAY_MS);
    return { left: (left / days) * 100, width: Math.max(0.6, ((right - left) / days) * 100) };
  };

  return (
    <>
      <PageHeader
        title="Fleet calendar"
        description="Which car is out, and when it's free. Click a free day to book it."
        actions={
          can(actor, "bookings.create") ? (
            <LinkButton href="/bookings/new">
              <Plus /> New booking
            </LinkButton>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/calendar${qs({ month: prev })}`} className="grid size-9 place-items-center rounded-lg border border-line hover:bg-surface-2" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-40 text-center font-semibold">{monthLabel}</h2>
          <Link href={`/calendar${qs({ month: next })}`} className="grid size-9 place-items-center rounded-lg border border-line hover:bg-surface-2" aria-label="Next month">
            <ChevronRight className="size-4" />
          </Link>
          {monthKey !== todayKey.slice(0, 7) ? (
            <Link href="/calendar" className="ml-2 text-sm text-primary hover:underline">
              Today
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {(["CONFIRMED", "RUNNING", "RETURNED", "CLOSED", "QUOTATION"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm", BAR[s])} /> {BOOKING_STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="flex border-b border-line">
            <div className="w-48 shrink-0 border-r border-line px-3 py-2 text-xs font-semibold text-muted">Car</div>
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
              {dayNumbers.map((d) => (
                <div
                  key={d.key}
                  className={cn(
                    "py-1 text-center text-[10px] leading-tight",
                    d.weekend && "bg-surface-2",
                    d.key === todayKey && "bg-primary-soft font-semibold text-primary",
                  )}
                >
                  <div className="text-muted">{d.weekday}</div>
                  <div>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          {cars.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No active cars.</p>
          ) : (
            cars.map((car) => {
              const rows = bookings.filter((b) => b.carId === car.id);
              return (
                <div key={car.id} className="flex border-b border-line last:border-b-0">
                  <Link href={`/cars/${car.id}`} className="w-48 shrink-0 border-r border-line px-3 py-2 hover:bg-surface-2">
                    <span className="block truncate text-sm font-medium">
                      {car.company} {car.model}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted">{formatRegistration(car.registrationNumber)}</span>
                      {car.status !== "AVAILABLE" ? (
                        <Badge tone={CAR_STATUS_META[car.status].tone} className="px-1.5 py-0 text-[9px]">
                          {CAR_STATUS_META[car.status].label}
                        </Badge>
                      ) : null}
                    </span>
                  </Link>
                  <div className="relative flex-1">
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
                      {dayNumbers.map((d) => {
                        const cellStart = new Date(`${d.key}T10:00:00+05:30`);
                        const bookable = can(actor, "bookings.create") && cellStart > addDays(now, -1);
                        return bookable ? (
                          <Link
                            key={d.key}
                            href={`/bookings/new${qs({
                              carId: car.id,
                              pickup: toDateTimeInput(cellStart),
                              return: toDateTimeInput(addDays(cellStart, 1)),
                            })}`}
                            title={`Book ${car.model} from ${d.key}`}
                            className={cn("border-r border-line/50 hover:bg-primary-soft", d.weekend && "bg-surface-2/60", d.key === todayKey && "bg-primary-soft/60")}
                          />
                        ) : (
                          <div key={d.key} className={cn("border-r border-line/50", d.weekend && "bg-surface-2/60")} />
                        );
                      })}
                    </div>
                    <div className="pointer-events-none relative h-12">
                      {rows.map((b) => {
                        const from = b.actualPickupAt ?? b.pickupAt;
                        const to =
                          b.actualReturnAt ??
                          (b.status === "RUNNING" && b.returnAt < now ? now : b.returnAt);
                        const pos = place(from, to);
                        return (
                          <Link
                            key={b.id}
                            href={`/bookings/${b.id}`}
                            title={`${b.bookingNumber} · ${b.customer.fullName} · ${formatShortDateTime(from)} → ${formatShortDateTime(to)}`}
                            className={cn(
                              "pointer-events-auto absolute top-2.5 flex h-7 items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap shadow-sm hover:ring-2 hover:ring-primary",
                              BAR[b.status],
                              b.status === "RUNNING" && b.returnAt < now && "ring-2 ring-danger",
                            )}
                            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          >
                            {b.customer.fullName}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </>
  );
}
