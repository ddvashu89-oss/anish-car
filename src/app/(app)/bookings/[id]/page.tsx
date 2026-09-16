import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  FileText,
  KeyRound,
  MessageCircle,
  Pencil,
  Printer,
  ReceiptIndianRupee,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHARGE_LABELS, kmCharge } from "@/lib/billing";
import { balanceDue, BOOKING_STATUS_META, depositHeld } from "@/lib/bookings";
import { formatRegistration } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { labelOf, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { fileUrl } from "@/lib/uploads";
import { formatDateTime, formatKm, formatMoney, round2, toNum } from "@/lib/utils";
import {
  adjustFromDepositAction,
  cancelBookingAction,
  closeBookingAction,
  confirmQuotationAction,
  deleteBookingAction,
} from "@/lib/actions/booking-actions";
import { generateInvoiceAction } from "@/lib/actions/invoice-actions";
import { refundAction, voidPaymentAction } from "@/lib/actions/payment-actions";
import {
  ActionButton,
  ActionForm,
  FCheckbox,
  FInput,
  FormField,
  FSelect,
  SubmitButton,
} from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, SummaryRow, Timeline } from "@/components/ui/display";
import { LinkButton, TextLink } from "@/components/ui/link-button";
import { EmptyRow, Table, TableWrap, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Booking · Anish Car Rent" };

function Photos({ paths }: { paths: unknown }) {
  const list = Array.isArray(paths) ? (paths as string[]) : [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p) => (
        <a key={p} href={fileUrl(p)!} target="_blank" rel="noreferrer">
          {p.endsWith(".pdf") ? (
            <span className="grid size-16 place-items-center rounded-md border border-line text-xs text-muted">PDF</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(p)!} alt="" className="size-16 rounded-md border border-line object-cover" />
          )}
        </a>
      ))}
    </div>
  );
}

function Checklist({ items }: { items: unknown }) {
  const list = Array.isArray(items) ? (items as string[]) : [];
  if (list.length === 0) return <p className="text-xs text-muted">No checklist items ticked.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {list.map((i) => (
        <li key={i}>
          <Badge tone="success">
            <CheckCircle2 className="size-3" /> {i}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("bookings.view");
  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) notFound();

  const [booking, deposit, settings] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        car: true,
        createdBy: { select: { name: true } },
        handover: { include: { handedOverBy: { select: { name: true } } } },
        vehicleReturn: { include: { receivedBy: { select: { name: true } } } },
        payments: { orderBy: { paidAt: "asc" }, include: { receivedBy: { select: { name: true } } } },
        refunds: { orderBy: { refundedAt: "asc" }, include: { issuedBy: { select: { name: true } } } },
        statusHistory: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
        invoices: { orderBy: { id: "desc" }, take: 1 },
        damages: { orderBy: { recordedAt: "asc" } },
      },
    }),
    depositHeld(bookingId),
    getSettings(),
  ]);
  if (!booking) notFound();

  const meta = BOOKING_STATUS_META[booking.status];
  const due = balanceDue(booking);
  const now = new Date();
  const s = booking.status;
  const overdue = s === "RUNNING" && booking.returnAt < now;
  const invoice = booking.invoices[0];

  const km =
    booking.startingKm != null && booking.endingKm != null
      ? kmCharge({
          startingKm: booking.startingKm,
          endingKm: booking.endingKm,
          rentalDays: booking.rentalDays,
          includedKmPerDay: booking.includedKmPerDay,
          extraKmRate: toNum(booking.extraKmRate),
        })
      : null;

  const waText = encodeURIComponent(
    [
      `Hello ${booking.customer.fullName},`,
      "",
      s === "QUOTATION" ? "Here is your rental quotation." : "Your car booking is confirmed.",
      `Booking: ${booking.bookingNumber}`,
      `Vehicle: ${booking.car.company} ${booking.car.model} (${formatRegistration(booking.car.registrationNumber)})`,
      `Pickup: ${formatDateTime(booking.pickupAt)}`,
      `Return: ${formatDateTime(booking.returnAt)}`,
      `Total: ${formatMoney(booking.totalAmount)}`,
      due > 0 ? `Balance: ${formatMoney(due)}` : "Fully paid — thank you!",
      "",
      settings.company.name,
      settings.company.phone,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  );

  const canEdit = can(actor, "bookings.edit");
  const canPay = can(actor, "payments.create");
  const canReturn = can(actor, "returns.create");

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-semibold tracking-tight">{booking.bookingNumber}</h1>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {overdue ? <Badge tone="danger">Overdue</Badge> : null}
              {due > 0.009 && !["QUOTATION", "DRAFT"].includes(s) ? <Badge tone="warning">{formatMoney(due)} due</Badge> : null}
              {due < -0.009 ? <Badge tone="info">{formatMoney(-due)} to refund</Badge> : null}
            </div>
            <p className="text-sm">
              <TextLink href={`/customers/${booking.customer.id}`}>{booking.customer.fullName}</TextLink>
              <span className="text-muted"> · {booking.customer.mobile} · </span>
              <TextLink href={`/cars/${booking.car.id}`}>
                {booking.car.company} {booking.car.model}
              </TextLink>
              <span className="font-mono text-xs text-muted"> {formatRegistration(booking.car.registrationNumber)}</span>
            </p>
            <p className="text-xs text-muted">
              {formatDateTime(booking.pickupAt)} → {formatDateTime(booking.returnAt)} · {booking.rentalDays} day
              {booking.rentalDays === 1 ? "" : "s"}
              {booking.createdBy ? ` · booked by ${booking.createdBy.name}` : ""}
            </p>
            {s === "CANCELLED" ? (
              <p className="rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">
                Cancelled {formatDateTime(booking.cancelledAt)}: {booking.cancellationReason}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {(s === "QUOTATION" || s === "DRAFT") && canEdit ? (
              <ActionButton action={confirmQuotationAction} fields={{ bookingId }} variant="primary" size="md">
                <CheckCircle2 /> Confirm booking
              </ActionButton>
            ) : null}
            {s === "CONFIRMED" && canReturn ? (
              <LinkButton href={`/bookings/${bookingId}/handover`}>
                <KeyRound /> Hand over car
              </LinkButton>
            ) : null}
            {s === "RUNNING" && canReturn ? (
              <LinkButton href={`/bookings/${bookingId}/return`}>
                <RotateCcw /> Receive car back
              </LinkButton>
            ) : null}
            {canPay && due > 0.009 && !["QUOTATION", "DRAFT"].includes(s) ? (
              <LinkButton href={`/payments/new?bookingId=${bookingId}`} variant={s === "RETURNED" ? "primary" : "outline"}>
                <ReceiptIndianRupee /> Receive payment
              </LinkButton>
            ) : null}
            {["QUOTATION", "DRAFT", "CONFIRMED"].includes(s) && canEdit ? (
              <LinkButton href={`/bookings/${bookingId}/edit`} variant="outline">
                <Pencil /> Edit
              </LinkButton>
            ) : null}
            <LinkButton href={`/bookings/${bookingId}/agreement`} variant="outline" target="_blank">
              <Printer /> {s === "QUOTATION" ? "Quotation" : "Agreement"}
            </LinkButton>
            {invoice ? (
              <LinkButton href={`/invoices/${invoice.id}`} variant="outline">
                <FileText /> {invoice.invoiceNumber}
              </LinkButton>
            ) : null}
            {can(actor, "invoices.create") && ["RETURNED", "CLOSED", "CANCELLED", "RUNNING", "CONFIRMED"].includes(s) ? (
              <ActionButton action={generateInvoiceAction} fields={{ bookingId }} variant="outline" size="md">
                <FileText /> {invoice ? "Refresh invoice" : "Generate invoice"}
              </ActionButton>
            ) : null}
            <a
              href={`https://wa.me/91${booking.customer.mobile}?text=${waText}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            {can(actor, "bookings.delete") && ["QUOTATION", "DRAFT", "CANCELLED"].includes(s) ? (
              <ActionButton
                action={deleteBookingAction}
                fields={{ bookingId }}
                confirm={`Delete ${booking.bookingNumber}?`}
                className="text-danger"
                size="md"
              >
                <Trash2 /> Delete
              </ActionButton>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Trip</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={3}
                items={[
                  { label: "Scheduled pickup", value: formatDateTime(booking.pickupAt) },
                  { label: "Actual pickup", value: formatDateTime(booking.actualPickupAt) },
                  { label: "Pickup location", value: booking.pickupLocation },
                  {
                    label: "Scheduled return",
                    value: <span className={overdue ? "font-medium text-danger" : undefined}>{formatDateTime(booking.returnAt)}</span>,
                  },
                  { label: "Actual return", value: formatDateTime(booking.actualReturnAt) },
                  { label: "Drop location", value: booking.dropLocation },
                  { label: "Starting km", value: booking.startingKm != null ? formatKm(booking.startingKm) : null },
                  { label: "Ending km", value: booking.endingKm != null ? formatKm(booking.endingKm) : null },
                  { label: "Driven", value: km ? formatKm(km.totalKm) : null },
                  {
                    label: "Km allowance",
                    value:
                      booking.includedKmPerDay > 0
                        ? `${formatKm(booking.includedKmPerDay * booking.rentalDays)} (${booking.includedKmPerDay}/day)`
                        : "Unlimited",
                  },
                  { label: "Extra km rate", value: `${formatMoney(booking.extraKmRate)}/km` },
                  { label: "Extra km", value: km && km.extraKm > 0 ? formatKm(km.extraKm) : null },
                  { label: "Late by", value: booking.vehicleReturn?.lateHours ? `${booking.vehicleReturn.lateHours} h` : null },
                  { label: "Fuel out / in", value: booking.handover ? `${booking.handover.fuelLevel ?? "—"} / ${booking.vehicleReturn?.fuelLevel ?? "—"}` : null },
                ]}
              />
              {booking.notes ? <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{booking.notes}</p> : null}
            </CardContent>
          </Card>

          {booking.handover || booking.vehicleReturn ? (
            <div className="grid gap-4 md:grid-cols-2">
              {booking.handover ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Handover</CardTitle>
                    <span className="text-xs text-muted">{booking.handover.handedOverBy?.name}</span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Checklist items={booking.handover.checklist} />
                    {booking.handover.damageNotes ? <p className="text-sm">{booking.handover.damageNotes}</p> : null}
                    <Photos paths={booking.handover.photos} />
                  </CardContent>
                </Card>
              ) : null}
              {booking.vehicleReturn ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Return inspection</CardTitle>
                    <span className="text-xs text-muted">{booking.vehicleReturn.receivedBy?.name}</span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Checklist items={booking.vehicleReturn.checklist} />
                    {booking.vehicleReturn.damageNotes ? <p className="text-sm">{booking.vehicleReturn.damageNotes}</p> : null}
                    <Photos paths={booking.vehicleReturn.photos} />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {booking.damages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Damage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {booking.damages.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {d.panel} <span className="text-xs text-muted">· {d.description}</span>
                    </span>
                    <Badge tone={d.severity === "MAJOR" ? "danger" : d.severity === "MODERATE" ? "warning" : "neutral"}>
                      {d.severity.toLowerCase()}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <TableWrap>
            <div className="border-b border-line px-5 py-4 text-sm font-semibold">Payments</div>
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Mode</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {booking.payments.length === 0 && booking.refunds.length === 0 ? (
                  <EmptyRow colSpan={6}>No money received yet.</EmptyRow>
                ) : null}
                {booking.payments.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <TextLink href={`/payments/${p.id}`} className="font-mono text-xs">
                        {p.paymentNumber}
                      </TextLink>
                    </Td>
                    <Td className="text-xs">
                      {formatDateTime(p.paidAt)}
                      {p.receivedBy ? <span className="block text-[11px] text-muted">{p.receivedBy.name}</span> : null}
                    </Td>
                    <Td>{labelOf(PAYMENT_TYPE_OPTIONS, p.paymentType)}</Td>
                    <Td className="text-xs">
                      {labelOf(PAYMENT_MODE_OPTIONS, p.paymentMode)}
                      {p.referenceNo ? <span className="block text-[11px] text-muted">{p.referenceNo}</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.status === "SUCCESS" ? (
                        formatMoney(p.amount)
                      ) : (
                        <span className="text-muted line-through" title={p.notes ?? undefined}>
                          {formatMoney(p.amount)}
                        </span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {p.status === "SUCCESS" && can(actor, "payments.delete") ? (
                        <ActionButton
                          action={voidPaymentAction}
                          fields={{ paymentId: p.id, reason: "Voided from booking" }}
                          confirm={`Void ${p.paymentNumber}? It will no longer count as received.`}
                          className="h-7 text-danger"
                        >
                          Void
                        </ActionButton>
                      ) : p.status !== "SUCCESS" ? (
                        <Badge tone="danger">void</Badge>
                      ) : null}
                    </Td>
                  </tr>
                ))}
                {booking.refunds.map((r) => (
                  <tr key={`r${r.id}`} className="bg-surface-2/40">
                    <Td className="font-mono text-xs">{r.refundNumber}</Td>
                    <Td className="text-xs">
                      {formatDateTime(r.refundedAt)}
                      {r.issuedBy ? <span className="block text-[11px] text-muted">{r.issuedBy.name}</span> : null}
                    </Td>
                    <Td>{r.kind === "DEPOSIT" ? "Deposit refund" : "Refund"}</Td>
                    <Td className="text-xs">
                      {labelOf(PAYMENT_MODE_OPTIONS, r.refundMode)}
                      {r.reason ? <span className="block text-[11px] text-muted">{r.reason}</span> : null}
                    </Td>
                    <Td className="text-right text-danger tabular-nums">− {formatMoney(r.amount)}</Td>
                    <Td />
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bill</CardTitle>
            </CardHeader>
            <CardContent>
              {CHARGE_LABELS.map(([key, label]) => {
                const v = toNum(booking[key]);
                return v > 0 || key === "rentalAmount" ? (
                  <SummaryRow
                    key={key}
                    label={key === "rentalAmount" ? `${label} (${booking.rentalDays} × ${formatMoney(booking.dailyRate)})` : label}
                    value={formatMoney(v)}
                  />
                ) : null;
              })}
              {toNum(booking.discountAmount) > 0 ? (
                <SummaryRow label="Discount" value={`− ${formatMoney(booking.discountAmount)}`} negative />
              ) : null}
              <SummaryRow label="Total" value={formatMoney(booking.totalAmount)} strong />
              <SummaryRow label="Paid" value={formatMoney(booking.paidAmount)} muted />
              <SummaryRow
                label={due < 0 ? "Overpaid" : "Balance"}
                value={<span className={due > 0.009 ? "text-danger" : due < -0.009 ? "text-info" : "text-success"}>{formatMoney(Math.abs(due))}</span>}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security deposit</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryRow label="Agreed" value={formatMoney(booking.securityDeposit)} muted />
              <SummaryRow label="Collected" value={formatMoney(deposit.collected)} />
              <SummaryRow label="Returned / adjusted" value={formatMoney(deposit.refunded)} />
              <SummaryRow label="Held now" value={formatMoney(deposit.held)} strong />
              {canPay && deposit.held > 0 && due > 0.009 && ["RUNNING", "RETURNED"].includes(s) ? (
                <div className="mt-3">
                  <ActionButton
                    action={adjustFromDepositAction}
                    fields={{ bookingId }}
                    confirm={`Use ${formatMoney(Math.min(deposit.held, due))} of the deposit towards the balance?`}
                    variant="outline"
                    size="sm"
                  >
                    Adjust {formatMoney(Math.min(deposit.held, due))} against balance
                  </ActionButton>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canPay && (deposit.held > 0.009 || due < -0.009) ? (
            <Card>
              <CardHeader>
                <CardTitle>Record a refund</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={refundAction}>
                  <input type="hidden" name="customerId" value={booking.customerId} />
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <FormField label="What is being returned" name="kind">
                    <FSelect
                      name="kind"
                      defaultValue={deposit.held > 0.009 ? "DEPOSIT" : "PAYMENT"}
                      options={[
                        ...(deposit.held > 0.009 ? [{ value: "DEPOSIT", label: `Deposit (held ${formatMoney(deposit.held)})` }] : []),
                        ...(due < -0.009 ? [{ value: "PAYMENT", label: `Overpayment (${formatMoney(-due)})` }] : []),
                      ]}
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Amount (₹)" name="amount">
                      <FInput
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={deposit.held > 0.009 ? deposit.held : round2(-due)}
                      />
                    </FormField>
                    <FormField label="Via" name="refundMode">
                      <FSelect name="refundMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
                    </FormField>
                  </div>
                  <FormField label="Note" name="reason">
                    <FInput name="reason" placeholder="Returned in cash at the counter" />
                  </FormField>
                  <SubmitButton size="sm" variant="outline">
                    Record refund
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          {s === "RETURNED" && can(actor, "bookings.approve") ? (
            <Card>
              <CardHeader>
                <CardTitle>Close booking</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={closeBookingAction}>
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <p className="text-xs text-muted">
                    Closing locks the booking once the balance and deposit are settled.
                  </p>
                  {due > 0.009 ? <FCheckbox name="writeOff" label={`Write off the remaining ${formatMoney(due)}`} /> : null}
                  <SubmitButton size="sm">Close booking</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          {["QUOTATION", "DRAFT", "CONFIRMED"].includes(s) && canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="size-4 text-danger" /> Cancel booking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={cancelBookingAction}>
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <FormField label="Reason" name="reason" required>
                    <FInput name="reason" placeholder="Customer changed plans" />
                  </FormField>
                  <FormField
                    label="Cancellation fee (₹)"
                    name="cancellationFee"
                    hint={toNum(booking.paidAmount) > 0 ? `${formatMoney(booking.paidAmount)} has been paid — anything above the fee is refundable.` : "Leave blank for no fee"}
                  >
                    <FInput name="cancellationFee" type="number" step="0.01" min="0" />
                  </FormField>
                  <SubmitButton size="sm" variant="danger" pendingText="Cancelling…">
                    Cancel booking
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                items={booking.statusHistory.map((h) => ({
                  id: String(h.id),
                  title: (
                    <>
                      {h.fromStatus ? `${BOOKING_STATUS_META[h.fromStatus].label} → ` : ""}
                      <strong>{BOOKING_STATUS_META[h.toStatus].label}</strong>
                    </>
                  ),
                  meta: [h.note, h.changedBy?.name].filter(Boolean).join(" · "),
                  when: formatDateTime(h.changedAt),
                  tone: h.toStatus === "CANCELLED" ? "danger" : h.toStatus === "CLOSED" ? "success" : undefined,
                }))}
              />
              <p className="mt-4 text-xs text-muted">
                Created {formatDateTime(booking.createdAt)} ·{" "}
                <Link href={`/audit`} className="hover:underline">
                  audit log
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
