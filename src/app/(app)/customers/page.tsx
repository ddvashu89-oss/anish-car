import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, UsersRound } from "lucide-react";

import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pendingByCustomer } from "@/lib/ledger";
import { CUSTOMER_STATUS_TONE, CUSTOMER_TYPE_TONE } from "@/lib/status";
import { formatDate, formatMoney, qs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Customers · Anish Car Rent" };

type Search = { q?: string; tab?: string; type?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePermission("customers.view");
  const sp = await searchParams;
  const tab = ["all", "vip", "pending", "blacklisted"].includes(sp.tab ?? "") ? sp.tab! : "all";
  const page = pageFrom(sp.page);
  const q = sp.q?.trim() ?? "";

  const pendingMap = await pendingByCustomer();
  const pendingIds = [...pendingMap.entries()].filter(([, v]) => v.pending > 0.009).map(([k]) => k);

  const where: Prisma.CustomerWhereInput = {
    ...(q
      ? {
          OR: [
            { fullName: { contains: q } },
            { mobile: { contains: q } },
            { altMobile: { contains: q } },
            { customerCode: { contains: q } },
            { drivingLicenseNo: { contains: q } },
            { email: { contains: q } },
            { city: { contains: q } },
          ],
        }
      : {}),
    ...(sp.type && ["REGULAR", "VIP", "CORPORATE"].includes(sp.type)
      ? { customerType: sp.type as "REGULAR" | "VIP" | "CORPORATE" }
      : {}),
    ...(tab === "vip" ? { customerType: "VIP" } : {}),
    ...(tab === "blacklisted" ? { status: "BLACKLISTED" } : {}),
    ...(tab === "pending" ? { id: { in: pendingIds } } : {}),
  };

  const [customers, total, counts] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        bookings: { select: { pickupAt: true }, orderBy: { pickupAt: "desc" }, take: 1 },
      },
    }),
    prisma.customer.count({ where }),
    Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { customerType: "VIP" } }),
      prisma.customer.count({ where: { status: "BLACKLISTED" } }),
    ]),
  ]);

  const base = { q, type: sp.type };
  const tabHref = (t: string) => `/customers${qs({ ...base, tab: t === "all" ? undefined : t })}`;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has rented, with what they owe at a glance."
        actions={
          <>
            {can(actor, "customers.export") ? (
              <LinkButton href={`/export/customers${qs({ q })}`} variant="outline">
                <Download /> Export
              </LinkButton>
            ) : null}
            {can(actor, "customers.create") ? (
              <LinkButton href="/customers/new">
                <Plus /> New customer
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Tabs
        active={tab}
        items={[
          { key: "all", label: "All", href: tabHref("all"), count: counts[0] },
          { key: "vip", label: "VIP", href: tabHref("vip"), count: counts[1] },
          { key: "pending", label: "Pending payments", href: tabHref("pending"), count: pendingIds.length },
          { key: "blacklisted", label: "Blacklisted", href: tabHref("blacklisted"), count: counts[2] },
        ]}
      />

      <FilterBar action="/customers" resetHref={`/customers${qs({ tab: tab === "all" ? undefined : tab })}`}>
        {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
        <SearchInput defaultValue={q} placeholder="Name, mobile, code, licence…" />
        <FilterSelect
          name="type"
          defaultValue={sp.type}
          placeholder="All types"
          options={[
            { value: "REGULAR", label: "Regular" },
            { value: "VIP", label: "VIP" },
            { value: "CORPORATE", label: "Corporate" },
          ]}
        />
      </FilterBar>

      <TableWrap>
        {customers.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={q || tab !== "all" ? "No customers match" : "No customers yet"}
            description={q || tab !== "all" ? "Try a different search or tab." : "Add your first customer to start taking bookings."}
            action={
              !q && tab === "all" && can(actor, "customers.create") ? (
                <LinkButton href="/customers/new">
                  <Plus /> New customer
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Mobile</Th>
                <Th>Type</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Billed</Th>
                <Th className="text-right">Pending</Th>
                <Th>Last rental</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const stats = pendingMap.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:text-primary">
                        {c.fullName}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">
                        {c.customerCode}
                        {c.city ? ` · ${c.city}` : ""}
                      </span>
                    </Td>
                    <Td className="tabular-nums">{c.mobile}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={CUSTOMER_TYPE_TONE[c.customerType]}>{c.customerType.toLowerCase()}</Badge>
                        {c.status !== "ACTIVE" ? (
                          <Badge tone={CUSTOMER_STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Badge>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{stats?.bookings ?? 0}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(stats?.billed ?? 0)}</Td>
                    <Td className="text-right tabular-nums">
                      {stats && stats.pending > 0.009 ? (
                        <span className="font-medium text-danger">{formatMoney(stats.pending)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-xs text-muted">{formatDate(c.bookings[0]?.pickupAt)}</Td>
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
        hrefFor={(p) => `/customers${qs({ ...base, tab: tab === "all" ? undefined : tab, page: p })}`}
      />
    </>
  );
}
