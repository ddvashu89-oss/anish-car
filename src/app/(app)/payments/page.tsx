import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, ReceiptIndianRupee } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOOKING_STATUS_META, REVENUE_PAYMENT_TYPES } from "@/lib/bookings";
import { endOfDayIST, parseDateInput, startOfDayIST } from "@/lib/dates";
import { labelOf, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney, formatShortDateTime, qs, round2, toNum } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState, MiniStat } from "@/components/ui/display";
import { FilterBar, FilterDate, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Payments · Anish Car Rent" };

type Search = { tab?: string; q?: string; from?: string; to?: string; mode?: string; type?: string; page?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePermission("payments.view");
  const sp = await searchParams;
  const tab = ["received", "pending", "refunds"].includes(sp.tab ?? "") ? sp.tab! : "received";
  const page = pageFrom(sp.page);
  const q = sp.q?.trim() ?? "";
  const from = sp.from ? parseDateInput(sp.from) : null;
  const to = sp.to ? parseDateInput(sp.to) : null;
  const range = from || to ? { ...(from ? { gte: startOfDayIST(from) } : {}), ...(to ? { lte: endOfDayIST(to) } : {}) } : undefined;

  const base = { q, from: sp.from, to: sp.to, mode: sp.mode, type: sp.type };
  const tabHref = (t: string) => `/payments${qs({ ...base, tab: t === "received" ? undefined : t })}`;

  const pendingWhere: Prisma.BookingWhereInput = {
    status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CANCELLED"] },
    ...(q
      ? { OR: [{ bookingNumber: { contains: q } }, { customer: { fullName: { contains: q } } }, { customer: { mobile: { contains: q } } }] }
      : {}),
  };

  const [pendingRows, refundCount] = await Promise.all([
    prisma.booking.findMany({
      where: pendingWhere,
      orderBy: { returnAt: "asc" },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true } },
        car: { select: { model: true, registrationNumber: true } },
      },
    }),
    prisma.refund.count(),
  ]);
  // Balance is a derived column, so the "has a balance" filter happens here.
  const pending = pendingRows
    .map((b) => ({ ...b, due: round2(toNum(b.totalAmount) - toNum(b.paidAmount)) }))
    .filter((b) => b.due > 0.009);

  const header = (
    <PageHeader
      title="Payments"
      description="Money in, money owed, and money returned."
      actions={
        <>
          {can(actor, "payments.export") ? (
            <LinkButton href={`/export/payments${qs(base)}`} variant="outline">
              <Download /> Export
            </LinkButton>
          ) : null}
          {can(actor, "payments.create") ? (
            <LinkButton href="/payments/new">
              <Plus /> Receive payment
            </LinkButton>
          ) : null}
        </>
      }
    />
  );

  const tabs = (receivedCount: number) => (
    <Tabs
      active={tab}
      items={[
        { key: "received", label: "Received", href: tabHref("received"), count: receivedCount },
        { key: "pending", label: "Pending", href: tabHref("pending"), count: pending.length },
        { key: "refunds", label: "Refunds", href: tabHref("refunds"), count: refundCount },
      ]}
    />
  );

  if (tab === "pending") {
    const receivedCount = await prisma.payment.count();
    const totalDue = round2(pending.reduce((s, b) => s + b.due, 0));
    const dueNow = round2(pending.filter((b) => b.status === "RETURNED").reduce((s, b) => s + b.due, 0));
    return (
      <>
        {header}
        {tabs(receivedCount)}
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Total receivable" value={formatMoney(totalDue)} tone="danger" />
          <MiniStat label="Due now (returned cars)" value={formatMoney(dueNow)} tone="warning" />
          <MiniStat label="Open bookings" value={pending.length} />
        </div>
        <FilterBar action="/payments" resetHref={tabHref("pending")}>
          <input type="hidden" name="tab" value="pending" />
          <SearchInput defaultValue={q} placeholder="Customer, mobile, booking…" />
        </FilterBar>
        <TableWrap>
          {pending.length === 0 ? (
            <EmptyState icon={ReceiptIndianRupee} title="Nothing pending" description="Every booking is paid up." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Booking</Th>
                  <Th>Return</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Pending</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {pending.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/customers/${b.customer.id}`} className="font-medium hover:text-primary">
                        {b.customer.fullName}
                      </Link>
                      <a href={`tel:${b.customer.mobile}`} className="block text-[11px] text-muted">
                        {b.customer.mobile}
                      </a>
                    </Td>
                    <Td>
                      <Link href={`/bookings/${b.id}`} className="font-mono text-xs text-primary hover:underline">
                        {b.bookingNumber}
                      </Link>
                      <Badge tone={BOOKING_STATUS_META[b.status].tone} className="ml-2">
                        {BOOKING_STATUS_META[b.status].label}
                      </Badge>
                      <span className="block text-[11px] text-muted">{b.car.model}</span>
                    </Td>
                    <Td className="text-xs">{formatShortDateTime(b.actualReturnAt ?? b.returnAt)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(b.totalAmount)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(b.paidAmount)}</Td>
                    <Td className="text-right font-semibold text-danger tabular-nums">{formatMoney(b.due)}</Td>
                    <Td className="text-right">
                      {can(actor, "payments.create") ? (
                        <LinkButton href={`/payments/new?bookingId=${b.id}`} size="sm">
                          Receive
                        </LinkButton>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableWrap>
      </>
    );
  }

  if (tab === "refunds") {
    const [refunds, receivedCount] = await Promise.all([
      prisma.refund.findMany({
        where: {
          ...(range ? { refundedAt: range } : {}),
          ...(q ? { OR: [{ refundNumber: { contains: q } }, { customer: { fullName: { contains: q } } }] } : {}),
        },
        orderBy: { refundedAt: "desc" },
        take: 200,
        include: {
          customer: { select: { id: true, fullName: true } },
          booking: { select: { id: true, bookingNumber: true } },
          issuedBy: { select: { name: true } },
        },
      }),
      prisma.payment.count(),
    ]);
    return (
      <>
        {header}
        {tabs(receivedCount)}
        <FilterBar action="/payments" resetHref={tabHref("refunds")}>
          <input type="hidden" name="tab" value="refunds" />
          <SearchInput defaultValue={q} placeholder="Refund no., customer…" />
          <FilterDate name="from" label="From" defaultValue={sp.from} />
          <FilterDate name="to" label="To" defaultValue={sp.to} />
        </FilterBar>
        <TableWrap>
          {refunds.length === 0 ? (
            <EmptyState icon={ReceiptIndianRupee} title="No refunds" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Refund</Th>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th>Booking</Th>
                  <Th>Kind</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.refundNumber}</Td>
                    <Td className="text-xs">
                      {formatDateTime(r.refundedAt)}
                      {r.issuedBy ? <span className="block text-[11px] text-muted">{r.issuedBy.name}</span> : null}
                    </Td>
                    <Td>
                      <Link href={`/customers/${r.customer.id}`} className="hover:text-primary">
                        {r.customer.fullName}
                      </Link>
                    </Td>
                    <Td>
                      {r.booking ? (
                        <Link href={`/bookings/${r.booking.id}`} className="font-mono text-xs text-primary hover:underline">
                          {r.booking.bookingNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Badge tone={r.kind === "DEPOSIT" ? "neutral" : "warning"}>{r.kind === "DEPOSIT" ? "Deposit" : "Payment"}</Badge>
                    </Td>
                    <Td className="text-xs">
                      {r.reason ?? "—"} · {labelOf(PAYMENT_MODE_OPTIONS, r.refundMode)}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(r.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableWrap>
      </>
    );
  }

  const where: Prisma.PaymentWhereInput = {
    ...(range ? { paidAt: range } : {}),
    ...(sp.mode && PAYMENT_MODE_OPTIONS.some((o) => o.value === sp.mode) ? { paymentMode: sp.mode as never } : {}),
    ...(sp.type && PAYMENT_TYPE_OPTIONS.some((o) => o.value === sp.type) ? { paymentType: sp.type as never } : {}),
    ...(q
      ? {
          OR: [
            { paymentNumber: { contains: q } },
            { referenceNo: { contains: q } },
            { customer: { fullName: { contains: q } } },
            { customer: { mobile: { contains: q } } },
            { booking: { bookingNumber: { contains: q } } },
          ],
        }
      : {}),
  };

  const [payments, total, sums] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, fullName: true } },
        booking: { select: { id: true, bookingNumber: true } },
        receivedBy: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ["paymentType"], where: { ...where, status: "SUCCESS" }, _sum: { amount: true } }),
  ]);

  const revenue = round2(
    sums.filter((s) => (REVENUE_PAYMENT_TYPES as readonly string[]).includes(s.paymentType)).reduce((a, s) => a + toNum(s._sum.amount), 0),
  );
  const deposits = round2(toNum(sums.find((s) => s.paymentType === "SECURITY_DEPOSIT")?._sum.amount));

  return (
    <>
      {header}
      {tabs(total)}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label={range ? "Rental collections (filtered)" : "Rental collections (all time)"} value={formatMoney(revenue)} tone="success" />
        <MiniStat label="Deposits collected" value={formatMoney(deposits)} />
        <MiniStat label="Receipts" value={total} />
      </div>

      <FilterBar action="/payments" resetHref="/payments">
        <SearchInput defaultValue={q} placeholder="Receipt, UTR, customer, booking…" />
        <FilterDate name="from" label="From" defaultValue={sp.from} />
        <FilterDate name="to" label="To" defaultValue={sp.to} />
        <FilterSelect name="mode" label="Mode" defaultValue={sp.mode} placeholder="Any mode" options={PAYMENT_MODE_OPTIONS} />
        <FilterSelect name="type" label="Type" defaultValue={sp.type} placeholder="Any type" options={PAYMENT_TYPE_OPTIONS} />
      </FilterBar>

      <TableWrap>
        {payments.length === 0 ? (
          <EmptyState icon={ReceiptIndianRupee} title="No payments found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Type</Th>
                <Th>Mode</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/payments/${p.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                      {p.paymentNumber}
                    </Link>
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatDate(p.paidAt)}
                    {p.receivedBy ? <span className="block text-[11px] text-muted">{p.receivedBy.name}</span> : null}
                  </Td>
                  <Td>
                    <Link href={`/customers/${p.customer.id}`} className="hover:text-primary">
                      {p.customer.fullName}
                    </Link>
                  </Td>
                  <Td>
                    {p.booking ? (
                      <Link href={`/bookings/${p.booking.id}`} className="font-mono text-xs hover:text-primary">
                        {p.booking.bookingNumber}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-xs">{labelOf(PAYMENT_TYPE_OPTIONS, p.paymentType)}</Td>
                  <Td className="text-xs">
                    {labelOf(PAYMENT_MODE_OPTIONS, p.paymentMode)}
                    {p.referenceNo ? <span className="block font-mono text-[11px] text-muted">{p.referenceNo}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.status === "SUCCESS" ? (
                      <span className="font-medium">{formatMoney(p.amount)}</span>
                    ) : (
                      <span className="text-muted line-through">{formatMoney(p.amount)}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination page={page} total={total} hrefFor={(p) => `/payments${qs({ ...base, page: p })}`} />
    </>
  );
}
