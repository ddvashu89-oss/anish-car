import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Car, FileText, ReceiptIndianRupee, Search, UsersRound } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOOKING_STATUS_META } from "@/lib/bookings";
import { formatRegistration, normalizeRegistration } from "@/lib/fleet";
import { CAR_STATUS_META } from "@/lib/status";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Search · Anish Car Rent" };

type Hit = { key: string; href: string; title: string; sub: string; badge?: { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" | "primary" } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePermission("dashboard.view");
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);

  if (!q) {
    return (
      <>
        <PageHeader title="Search" />
        <Card>
          <EmptyState icon={Search} title="Search everything" description="Type a customer name, mobile, car number, booking, invoice or receipt number in the bar above." />
        </Card>
      </>
    );
  }

  const reg = normalizeRegistration(q);
  const digits = q.replace(/\D/g, "");
  const upper = q.toUpperCase();

  const [customers, cars, bookings, payments, invoices] = await Promise.all([
    can(actor, "customers.view")
      ? prisma.customer.findMany({
          where: {
            OR: [
              { fullName: { contains: q } },
              { customerCode: { contains: upper } },
              { drivingLicenseNo: { contains: upper } },
              { email: { contains: q } },
              ...(digits.length >= 4 ? [{ mobile: { contains: digits } }, { altMobile: { contains: digits } }] : []),
            ],
          },
          take: 10,
          select: { id: true, fullName: true, mobile: true, customerCode: true, status: true },
        })
      : [],
    can(actor, "cars.view") && reg.length >= 2
      ? prisma.car.findMany({
          where: { OR: [{ registrationNumber: { contains: reg } }, { model: { contains: q } }, { company: { contains: q } }] },
          take: 10,
          select: { id: true, company: true, model: true, registrationNumber: true, status: true },
        })
      : [],
    can(actor, "bookings.view")
      ? prisma.booking.findMany({
          where: { bookingNumber: { contains: upper } },
          take: 10,
          orderBy: { pickupAt: "desc" },
          select: { id: true, bookingNumber: true, status: true, pickupAt: true, customer: { select: { fullName: true } } },
        })
      : [],
    can(actor, "payments.view")
      ? prisma.payment.findMany({
          where: { OR: [{ paymentNumber: { contains: upper } }, { referenceNo: { contains: q } }] },
          take: 10,
          orderBy: { paidAt: "desc" },
          select: { id: true, paymentNumber: true, amount: true, paidAt: true, customer: { select: { fullName: true } } },
        })
      : [],
    can(actor, "invoices.view")
      ? prisma.invoice.findMany({
          where: { invoiceNumber: { contains: upper } },
          take: 10,
          select: { id: true, invoiceNumber: true, total: true, issuedAt: true, customer: { select: { fullName: true } } },
        })
      : [],
  ]);

  const groups: Array<{ label: string; icon: typeof Search; hits: Hit[] }> = [
    {
      label: "Customers",
      icon: UsersRound,
      hits: customers.map((c) => ({
        key: `c${c.id}`,
        href: `/customers/${c.id}`,
        title: c.fullName,
        sub: `${c.mobile} · ${c.customerCode}`,
        badge: c.status === "BLACKLISTED" ? { label: "blacklisted", tone: "danger" } : undefined,
      })),
    },
    {
      label: "Cars",
      icon: Car,
      hits: cars.map((c) => ({
        key: `v${c.id}`,
        href: `/cars/${c.id}`,
        title: `${c.company} ${c.model}`,
        sub: formatRegistration(c.registrationNumber),
        badge: CAR_STATUS_META[c.status],
      })),
    },
    {
      label: "Bookings",
      icon: CalendarDays,
      hits: bookings.map((b) => ({
        key: `b${b.id}`,
        href: `/bookings/${b.id}`,
        title: b.bookingNumber,
        sub: `${b.customer.fullName} · ${formatDate(b.pickupAt)}`,
        badge: BOOKING_STATUS_META[b.status],
      })),
    },
    {
      label: "Payments",
      icon: ReceiptIndianRupee,
      hits: payments.map((p) => ({
        key: `p${p.id}`,
        href: `/payments/${p.id}`,
        title: `${p.paymentNumber} · ${formatMoney(p.amount)}`,
        sub: `${p.customer.fullName} · ${formatDate(p.paidAt)}`,
      })),
    },
    {
      label: "Invoices",
      icon: FileText,
      hits: invoices.map((i) => ({
        key: `i${i.id}`,
        href: `/invoices/${i.id}`,
        title: `${i.invoiceNumber} · ${formatMoney(i.total)}`,
        sub: `${i.customer.fullName} · ${formatDate(i.issuedAt)}`,
      })),
    },
  ].filter((g) => g.hits.length > 0);

  const all = groups.flatMap((g) => g.hits);
  // An exact identifier — a booking number, full mobile or plate — goes straight to the record.
  const exactBooking = bookings.find((b) => b.bookingNumber === upper);
  if (exactBooking) redirect(`/bookings/${exactBooking.id}`);
  const exactCar = cars.find((c) => c.registrationNumber === reg);
  if (exactCar && reg.length >= 6) redirect(`/cars/${exactCar.id}`);
  const exactCustomer = digits.length === 10 ? customers.find((c) => c.mobile === digits) : undefined;
  if (exactCustomer) redirect(`/customers/${exactCustomer.id}`);
  const exactInvoice = invoices.find((i) => i.invoiceNumber === upper);
  if (exactInvoice) redirect(`/invoices/${exactInvoice.id}`);
  const exactPayment = payments.find((p) => p.paymentNumber === upper);
  if (exactPayment) redirect(`/payments/${exactPayment.id}`);
  if (all.length === 1) redirect(all[0].href);

  return (
    <>
      <PageHeader title={`Results for “${q}”`} description={`${all.length} match${all.length === 1 ? "" : "es"}`} />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="Nothing found" description="Try a mobile number, part of a name, or a booking / car number." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.label}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <g.icon className="size-4 text-muted" /> {g.label}
                </CardTitle>
                <span className="text-xs text-muted">{g.hits.length}</span>
              </CardHeader>
              <CardContent className="divide-y divide-line p-0">
                {g.hits.map((h) => (
                  <Link key={h.key} href={h.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="block truncate text-xs text-muted">{h.sub}</span>
                    </span>
                    {h.badge ? <Badge tone={h.badge.tone}>{h.badge.label}</Badge> : null}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
