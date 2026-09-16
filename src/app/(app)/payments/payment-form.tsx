"use client";

import { useState } from "react";

import type { FormState } from "@/lib/actions/types";
import { PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { formatMoney } from "@/lib/utils";
import {
  ActionForm,
  FInput,
  FormField,
  FSelect,
  SubmitButton,
  useFormState,
} from "@/components/form/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/link-button";

export type PayCustomer = { id: number; label: string };
export type PayBooking = {
  id: number;
  customerId: number;
  label: string;
  balance: number;
  depositDue: number;
  status: string;
};

export function PaymentForm(props: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: PayCustomer[];
  bookings: PayBooking[];
  defaults: { customerId?: number; bookingId?: number; paidAt: string };
  returnTo?: string;
  cancelHref: string;
}) {
  return (
    <ActionForm action={props.action} className="max-w-3xl">
      <Fields {...props} />
    </ActionForm>
  );
}

function Fields({ customers, bookings, defaults, returnTo, cancelHref }: Parameters<typeof PaymentForm>[0]) {
  const state = useFormState();
  const echo = state.error ? state.values : undefined;

  const [customerId, setCustomerId] = useState(String(echo?.customerId ?? defaults.customerId ?? ""));
  const [bookingId, setBookingId] = useState(String(echo?.bookingId ?? defaults.bookingId ?? ""));
  const [filter, setFilter] = useState("");
  const [type, setType] = useState(echo?.paymentType ?? "");

  const customerBookings = bookings.filter((b) => String(b.customerId) === customerId);
  const booking = customerBookings.find((b) => String(b.id) === bookingId);

  const suggestedType = !booking ? "OTHER" : booking.status === "CONFIRMED" ? "ADVANCE" : booking.status === "RETURNED" ? "FINAL" : "PARTIAL";
  const effectiveType = type || suggestedType;
  const suggestedAmount = booking
    ? effectiveType === "SECURITY_DEPOSIT"
      ? booking.depositDue
      : Math.max(0, booking.balance)
    : 0;

  const [amount, setAmount] = useState(echo?.amount ?? "");
  const shownAmount = amount === "" && suggestedAmount > 0 ? String(suggestedAmount) : amount;

  const needle = filter.trim().toLowerCase();
  const matching = needle ? customers.filter((c) => c.label.toLowerCase().includes(needle)) : customers;
  const current = customers.find((c) => String(c.id) === customerId);
  const visibleCustomers = current && !matching.includes(current) ? [current, ...matching] : matching;

  return (
    <>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Customer" name="customerId" required className="sm:col-span-2">
            <div className="space-y-2">
              <Input placeholder="Filter customers…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Select
                name="customerId"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setBookingId("");
                  setAmount("");
                }}
              >
                <option value="">Select a customer…</option>
                {visibleCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </FormField>

          <FormField
            label="Booking"
            name="bookingId"
            className="sm:col-span-2"
            hint={customerId && customerBookings.length === 0 ? "This customer has no open bookings — the payment will be recorded on their account." : undefined}
          >
            <Select
              name="bookingId"
              value={bookingId}
              onChange={(e) => {
                setBookingId(e.target.value);
                setAmount("");
                setType("");
              }}
              disabled={!customerId}
            >
              <option value="">Not linked to a booking</option>
              {customerBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} · {b.balance > 0 ? `${formatMoney(b.balance)} due` : "nothing due"}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Payment for" name="paymentType">
            <Select name="paymentType" value={effectiveType} onChange={(e) => setType(e.target.value)}>
              {PAYMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Amount (₹)"
            name="amount"
            required
            hint={
              booking
                ? effectiveType === "SECURITY_DEPOSIT"
                  ? `Deposit still to collect: ${formatMoney(booking.depositDue)}`
                  : effectiveType === "PENALTY"
                    ? "Adds to the bill and records it as paid"
                    : `Balance due: ${formatMoney(booking.balance)}`
                : undefined
            }
          >
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              value={shownAmount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField label="Mode" name="paymentMode">
            <FSelect name="paymentMode" defaultValue="UPI" options={PAYMENT_MODE_OPTIONS} />
          </FormField>

          <FormField label="UTR / transaction / cheque no." name="referenceNo" hint="Required for UPI, bank transfer and cheque">
            <FInput name="referenceNo" />
          </FormField>

          <FormField label="Received on" name="paidAt" required>
            <FInput name="paidAt" type="datetime-local" defaultValue={defaults.paidAt} />
          </FormField>

          <FormField label="Note" name="notes">
            <FInput name="notes" />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>Save payment</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </>
  );
}
