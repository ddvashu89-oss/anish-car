import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { endOfDayIST, parseDateInput, startOfDayIST } from "@/lib/dates";
import { INVOICE_STATUS_TONE } from "@/lib/status";
import { formatDate, formatMoney, qs, round2, toNum, titleCase } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { FilterBar, FilterDate, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Invoices · Anish Car Rent" };

const STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; page?: string }>;
}) {
  await requirePermission("invoices.view");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = pageFrom(sp.page);
  const from = sp.from ? parseDateInput(sp.from) : null;
  const to = sp.to ? parseDateInput(sp.to) : null;

  const where: Prisma.InvoiceWhereInput = {
    ...((STATUSES as readonly string[]).includes(sp.status ?? "") ? { status: sp.status as (typeof STATUSES)[number] } : {}),
    ...(from || to
      ? { issuedAt: { ...(from ? { gte: startOfDayIST(from) } : {}), ...(to ? { lte: endOfDayIST(to) } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q } },
            { customer: { fullName: { contains: q } } },
            { customer: { mobile: { contains: q } } },
            { booking: { bookingNumber: { contains: q } } },
          ],
        }
      : {}),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, fullName: true } },
        booking: { select: { id: true, bookingNumber: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  const base = { q, status: sp.status, from: sp.from, to: sp.to };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Generated from bookings — open a booking and choose Generate invoice to create one."
      />

      <FilterBar action="/invoices" resetHref="/invoices">
        <SearchInput defaultValue={q} placeholder="Invoice, customer, booking…" />
        <FilterSelect
          name="status"
          label="Status"
          defaultValue={sp.status}
          placeholder="Any status"
          options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
        />
        <FilterDate name="from" label="From" defaultValue={sp.from} />
        <FilterDate name="to" label="To" defaultValue={sp.to} />
      </FilterBar>

      <TableWrap>
        {invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices yet" description="Invoices are created from the booking page." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const balance = round2(toNum(inv.total) - toNum(inv.paidAmount));
                return (
                  <tr key={inv.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/invoices/${inv.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </Td>
                    <Td className="text-xs">{formatDate(inv.issuedAt)}</Td>
                    <Td>
                      <Link href={`/customers/${inv.customer.id}`} className="hover:text-primary">
                        {inv.customer.fullName}
                      </Link>
                    </Td>
                    <Td>
                      {inv.booking ? (
                        <Link href={`/bookings/${inv.booking.id}`} className="font-mono text-xs hover:text-primary">
                          {inv.booking.bookingNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Badge tone={INVOICE_STATUS_TONE[inv.status]}>{titleCase(inv.status)}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(inv.total)}</Td>
                    <Td className="text-right tabular-nums">
                      {inv.status !== "CANCELLED" && balance > 0.009 ? (
                        <span className="text-danger">{formatMoney(balance)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination page={page} total={total} hrefFor={(p) => `/invoices${qs({ ...base, page: p })}`} />
    </>
  );
}
