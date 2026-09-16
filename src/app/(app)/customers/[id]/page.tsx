import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarPlus,
  FilePlus2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  ReceiptIndianRupee,
  Trash2,
} from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOOKING_STATUS_META, balanceDue } from "@/lib/bookings";
import { todayDateOnly } from "@/lib/dates";
import { daysLeftLabel, DOC_STATE_META, documentState } from "@/lib/documents";
import { customerLedger } from "@/lib/ledger";
import { getSettings } from "@/lib/settings";
import { CUSTOMER_STATUS_TONE, CUSTOMER_TYPE_TONE, labelOf, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import { formatDate, formatDateTime, formatMoney, formatShortDateTime, initials } from "@/lib/utils";
import {
  addCustomerNoteAction,
  deleteCustomerAction,
  deleteCustomerNoteAction,
} from "@/lib/actions/customer-actions";
import { ActionButton, ActionForm, FTextarea, SubmitButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, EmptyState, MiniStat, Timeline } from "@/components/ui/display";
import { LinkButton, TextLink } from "@/components/ui/link-button";
import { EmptyRow, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { DocumentTable } from "../../documents/document-table";

export const metadata: Metadata = { title: "Customer · Anish Car Rent" };

const TABS = ["overview", "bookings", "payments", "ledger", "documents", "notes"] as const;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePermission("customers.view");
  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId)) notFound();
  const tabParam = (await searchParams).tab;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? tabParam! : "overview";

  const [customer, ledger, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        createdBy: { select: { name: true } },
        bookings: {
          orderBy: { pickupAt: "desc" },
          include: { car: { select: { id: true, company: true, model: true, registrationNumber: true } } },
        },
        payments: {
          orderBy: { paidAt: "desc" },
          include: { booking: { select: { id: true, bookingNumber: true } }, receivedBy: { select: { name: true } } },
        },
        refunds: { orderBy: { refundedAt: "desc" }, include: { booking: { select: { id: true, bookingNumber: true } } } },
        documents: { orderBy: { expiryDate: "asc" } },
        customerNotes: { orderBy: { createdAt: "desc" } },
      },
    }),
    customerLedger(customerId),
    getSettings(),
  ]);

  if (!customer) notFound();

  const today = todayDateOnly();
  const licence = documentState(customer.licenseExpiry, today, settings.reminders.licenceDays);
  const counted = customer.bookings.filter((b) => !["DRAFT", "QUOTATION", "CANCELLED"].includes(b.status));
  const lastRental = counted[0]?.pickupAt;
  const average = counted.length ? ledger.billed / counted.length : 0;
  const waNumber = `91${customer.mobile}`;

  const tabHref = (t: string) => `/customers/${customerId}${t === "overview" ? "" : `?tab=${t}`}`;

  const timeline = [
    ...customer.bookings.map((b) => ({
      id: `b${b.id}`,
      at: b.createdAt,
      title: (
        <>
          Booking <TextLink href={`/bookings/${b.id}`}>{b.bookingNumber}</TextLink> · {b.car.company} {b.car.model}
        </>
      ),
      meta: `${formatShortDateTime(b.pickupAt)} → ${formatShortDateTime(b.returnAt)} · ${BOOKING_STATUS_META[b.status].label}`,
      tone: b.status === "CANCELLED" ? "danger" : undefined,
    })),
    ...customer.payments.map((p) => ({
      id: `p${p.id}`,
      at: p.paidAt,
      title: (
        <>
          Paid {formatMoney(p.amount)} · {labelOf(PAYMENT_MODE_OPTIONS, p.paymentMode)}
        </>
      ),
      meta: `${labelOf(PAYMENT_TYPE_OPTIONS, p.paymentType)}${p.booking ? ` · ${p.booking.bookingNumber}` : ""}`,
      tone: "success",
    })),
    ...customer.refunds.map((r) => ({
      id: `r${r.id}`,
      at: r.refundedAt,
      title: <>Refunded {formatMoney(r.amount)}</>,
      meta: r.reason ?? (r.kind === "DEPOSIT" ? "Deposit refund" : "Payment refund"),
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
            {customer.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl(customer.photoUrl)!}
                alt=""
                className="size-16 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
                {initials(customer.fullName)}
              </span>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{customer.fullName}</h1>
                <Badge tone={CUSTOMER_TYPE_TONE[customer.customerType]}>{customer.customerType.toLowerCase()}</Badge>
                {customer.status !== "ACTIVE" ? (
                  <Badge tone={CUSTOMER_STATUS_TONE[customer.status]}>{customer.status.toLowerCase()}</Badge>
                ) : null}
              </div>
              <p className="font-mono text-xs text-muted">{customer.customerCode}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <a href={`tel:${customer.mobile}`} className="flex items-center gap-1.5 hover:text-primary">
                  <Phone className="size-3.5 text-muted" /> {customer.mobile}
                </a>
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary"
                >
                  <MessageCircle className="size-3.5 text-muted" /> WhatsApp
                </a>
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Mail className="size-3.5 text-muted" /> {customer.email}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">DL:</span>
                <span className="font-mono">{customer.drivingLicenseNo ?? "not recorded"}</span>
                {customer.licenseExpiry ? (
                  <Badge tone={DOC_STATE_META[licence.state].tone}>
                    {DOC_STATE_META[licence.state].label} · {daysLeftLabel(licence.daysLeft)}
                  </Badge>
                ) : null}
              </div>
              {customer.status === "BLACKLISTED" && customer.blacklistReason ? (
                <p className="rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">
                  Blacklisted: {customer.blacklistReason}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {can(actor, "bookings.create") && customer.status !== "BLACKLISTED" ? (
              <LinkButton href={`/bookings/new?customerId=${customer.id}`} size="sm">
                <CalendarPlus /> New booking
              </LinkButton>
            ) : null}
            {can(actor, "payments.create") ? (
              <LinkButton href={`/payments/new?customerId=${customer.id}`} size="sm" variant="outline">
                <ReceiptIndianRupee /> Receive payment
              </LinkButton>
            ) : null}
            {can(actor, "customers.edit") ? (
              <LinkButton href={`/customers/${customer.id}/edit`} size="sm" variant="outline">
                <Pencil /> Edit
              </LinkButton>
            ) : null}
            {can(actor, "customers.delete") ? (
              <ActionButton
                action={deleteCustomerAction}
                fields={{ customerId: customer.id }}
                confirm={`Delete ${customer.fullName}? This cannot be undone.`}
                variant="ghost"
                className="text-danger"
              >
                <Trash2 /> Delete
              </ActionButton>
            ) : null}
          </div>
        </CardContent>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-5 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Rentals" value={counted.length} />
          <MiniStat label="Total billed" value={formatMoney(ledger.billed)} />
          <MiniStat label="Paid" value={formatMoney(ledger.paid)} tone="success" />
          <MiniStat label="Pending" value={formatMoney(ledger.balance)} tone={ledger.balance > 0.009 ? "danger" : undefined} />
          <MiniStat label="Deposit held" value={formatMoney(ledger.depositsHeld)} tone={ledger.depositsHeld > 0 ? "warning" : undefined} />
          <MiniStat label="Average rental" value={formatMoney(average)} />
        </div>
      </Card>

      <Tabs
        active={tab}
        items={[
          { key: "overview", label: "Overview", href: tabHref("overview") },
          { key: "bookings", label: "Bookings", href: tabHref("bookings"), count: customer.bookings.length },
          { key: "payments", label: "Payments", href: tabHref("payments"), count: customer.payments.length },
          { key: "ledger", label: "Ledger", href: tabHref("ledger") },
          { key: "documents", label: "Documents", href: tabHref("documents"), count: customer.documents.length },
          { key: "notes", label: "Notes", href: tabHref("notes"), count: customer.customerNotes.length },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Alternate mobile", value: customer.altMobile },
                  { label: "Address", value: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") || null },
                  { label: "ID proof", value: customer.idProofType ? `${customer.idProofType} · ${customer.idProofNumber ?? "—"}` : null },
                  { label: "Licence expiry", value: formatDate(customer.licenseExpiry) },
                  {
                    label: "Emergency contact",
                    value: customer.emergencyContactName
                      ? `${customer.emergencyContactName}${customer.emergencyContactPhone ? ` · ${customer.emergencyContactPhone}` : ""}`
                      : null,
                  },
                  { label: "Last rental", value: formatDate(lastRental) },
                  { label: "Customer since", value: formatDate(customer.createdAt) },
                  { label: "Added by", value: customer.createdBy?.name },
                ]}
              />
              {customer.notes ? (
                <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{customer.notes}</p>
              ) : null}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No bookings or payments yet.</p>
              ) : (
                <Timeline
                  items={timeline.map((t) => ({ id: t.id, title: t.title, meta: t.meta, when: formatDate(t.at), tone: t.tone }))}
                />
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
                <Th>Car</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {customer.bookings.length === 0 ? (
                <EmptyRow colSpan={6}>No bookings yet.</EmptyRow>
              ) : (
                customer.bookings.map((b) => {
                  const due = balanceDue(b);
                  const meta = BOOKING_STATUS_META[b.status];
                  return (
                    <tr key={b.id} className="hover:bg-surface-2/60">
                      <Td>
                        <TextLink href={`/bookings/${b.id}`} className="font-mono text-xs">
                          {b.bookingNumber}
                        </TextLink>
                      </Td>
                      <Td>
                        <Link href={`/cars/${b.car.id}`} className="hover:text-primary">
                          {b.car.company} {b.car.model}
                        </Link>
                        <span className="block font-mono text-[11px] text-muted">{b.car.registrationNumber}</span>
                      </Td>
                      <Td className="text-xs">
                        {formatShortDateTime(b.pickupAt)} → {formatShortDateTime(b.returnAt)}
                      </Td>
                      <Td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{formatMoney(b.totalAmount)}</Td>
                      <Td className="text-right tabular-nums">
                        {b.status !== "CANCELLED" && due > 0.009 ? (
                          <span className="text-danger">{formatMoney(due)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}

      {tab === "payments" ? (
        <div className="space-y-4">
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Mode</Th>
                  <Th>Booking</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {customer.payments.length === 0 ? (
                  <EmptyRow colSpan={6}>No payments yet.</EmptyRow>
                ) : (
                  customer.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2/60">
                      <Td>
                        <TextLink href={`/payments/${p.id}`} className="font-mono text-xs">
                          {p.paymentNumber}
                        </TextLink>
                      </Td>
                      <Td className="text-xs">{formatDateTime(p.paidAt)}</Td>
                      <Td>{labelOf(PAYMENT_TYPE_OPTIONS, p.paymentType)}</Td>
                      <Td>
                        {labelOf(PAYMENT_MODE_OPTIONS, p.paymentMode)}
                        {p.referenceNo ? <span className="block text-[11px] text-muted">{p.referenceNo}</span> : null}
                      </Td>
                      <Td>
                        {p.booking ? (
                          <TextLink href={`/bookings/${p.booking.id}`} className="font-mono text-xs">
                            {p.booking.bookingNumber}
                          </TextLink>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-right font-medium tabular-nums">
                        {p.status === "SUCCESS" ? formatMoney(p.amount) : <span className="text-muted line-through">{formatMoney(p.amount)}</span>}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
          {customer.refunds.length > 0 ? (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Refund</Th>
                    <Th>Date</Th>
                    <Th>Kind</Th>
                    <Th>Reason</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.refunds.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-mono text-xs">{r.refundNumber}</Td>
                      <Td className="text-xs">{formatDateTime(r.refundedAt)}</Td>
                      <Td>{r.kind === "DEPOSIT" ? "Deposit" : "Payment"}</Td>
                      <Td className="text-sm">{r.reason ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(r.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          ) : null}
        </div>
      ) : null}

      {tab === "ledger" ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Reference</Th>
                <Th>Details</Th>
                <Th className="text-right">Charged</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-surface-2/50">
                <Td colSpan={5} className="text-xs text-muted">
                  Opening balance
                </Td>
                <Td className="text-right tabular-nums">{formatMoney(0)}</Td>
              </tr>
              {ledger.entries.length === 0 ? (
                <EmptyRow colSpan={6}>Nothing billed yet.</EmptyRow>
              ) : (
                ledger.entries.map((e) => (
                  <tr key={e.key}>
                    <Td className="text-xs whitespace-nowrap">{formatDate(e.date)}</Td>
                    <Td>
                      <TextLink href={e.href} className="font-mono text-xs">
                        {e.reference}
                      </TextLink>
                    </Td>
                    <Td className="text-sm">{e.description}</Td>
                    <Td className="text-right tabular-nums">{e.debit ? formatMoney(e.debit) : ""}</Td>
                    <Td className="text-right text-success tabular-nums">{e.credit ? formatMoney(e.credit) : ""}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatMoney(e.balance)}</Td>
                  </tr>
                ))
              )}
              <tr className="bg-surface-2/50 font-semibold">
                <Td colSpan={3}>Closing balance</Td>
                <Td className="text-right tabular-nums">{formatMoney(ledger.billed)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(ledger.paid)}</Td>
                <Td className={`text-right tabular-nums ${ledger.balance > 0.009 ? "text-danger" : ""}`}>
                  {formatMoney(ledger.balance)}
                </Td>
              </tr>
            </tbody>
          </Table>
          {ledger.depositsHeld > 0 ? (
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              Security deposit currently held: <strong className="text-fg">{formatMoney(ledger.depositsHeld)}</strong> — not
              part of the balance above.
            </p>
          ) : null}
        </TableWrap>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-3">
          {can(actor, "documents.create") ? (
            <div className="flex justify-end">
              <LinkButton href={`/documents/new?customerId=${customer.id}`} size="sm">
                <FilePlus2 /> Add document
              </LinkButton>
            </div>
          ) : null}
          <DocumentTable
            rows={customer.documents.map((d) => ({
              id: d.id,
              kind: "customer" as const,
              documentType: d.documentType,
              documentNumber: d.documentNumber,
              issueDate: d.issueDate,
              expiryDate: d.expiryDate,
              fileUrl: d.fileUrl,
              notes: d.notes,
            }))}
            windowFor={() => settings.reminders.licenceDays}
            canEdit={can(actor, "documents.edit")}
            canDelete={can(actor, "documents.delete")}
            emptyText="No documents uploaded for this customer."
          />
        </div>
      ) : null}

      {tab === "notes" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {can(actor, "customers.edit") ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Add note</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={addCustomerNoteAction.bind(null, customer.id)} showSuccess={false}>
                  <FTextarea name="body" rows={4} placeholder="Called about the pending balance…" />
                  <SubmitButton size="sm">Save note</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
          <div className="space-y-3 lg:col-span-2">
            {customer.customerNotes.length === 0 ? (
              <Card>
                <EmptyState icon={Pencil} title="No notes yet" description="Notes are a shared log for the whole team." />
              </Card>
            ) : (
              customer.customerNotes.map((n) => (
                <Card key={n.id}>
                  <CardContent className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>
                        {n.authorName ?? "Someone"} · {formatDateTime(n.createdAt)}
                      </span>
                      {can(actor, "customers.edit") ? (
                        <ActionButton
                          action={deleteCustomerNoteAction}
                          fields={{ noteId: n.id }}
                          confirm="Delete this note?"
                          className="h-7 text-danger"
                        >
                          Delete
                        </ActionButton>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
