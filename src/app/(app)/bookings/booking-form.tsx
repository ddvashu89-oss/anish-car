"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Car as CarIcon, Check, UserPlus } from "lucide-react";

import type { FormState } from "@/lib/actions/types";
import { quoteRental, type RateRuleInput } from "@/lib/billing";
import { parseDateTimeInput } from "@/lib/dates";
import { PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { cn, formatMoney, formatShortDateTime, round2 } from "@/lib/utils";
import {
  ActionForm,
  FInput,
  FormField,
  FSelect,
  FTextarea,
  SubmitButton,
  useFormState,
} from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

export type BookingCar = {
  id: number;
  registrationNumber: string;
  company: string;
  model: string;
  variant: string | null;
  fuelType: string;
  transmission: string;
  seatingCapacity: number | null;
  dailyRate: number;
  includedKmPerDay: number;
  extraKmRate: number;
  securityDeposit: number;
  available: boolean;
  reason: string | null;
};

export type BookingCustomer = {
  id: number;
  fullName: string;
  mobile: string;
  customerCode: string;
  status: string;
  licenseExpiry: string | null;
};

type Defaults = {
  customerId?: number;
  carId?: number;
  pickupLocation?: string | null;
  dropLocation?: string | null;
  rateOverride?: number | null;
  discountAmount?: number;
  securityDeposit?: number;
  includedKmPerDay?: number;
  extraKmRate?: number;
  notes?: string | null;
};

const num = (v: string) => {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? 0 : n;
};

export function BookingForm(props: {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  pickup: string;
  returnAt: string;
  changeDatesHref: string;
  cars: BookingCar[];
  customers: BookingCustomer[];
  rules: RateRuleInput[];
  defaults: Defaults;
  paidSoFar?: number;
}) {
  return (
    <ActionForm action={props.action} className="space-y-4">
      <BookingFields {...props} />
    </ActionForm>
  );
}

function BookingFields({
  mode,
  pickup,
  returnAt,
  changeDatesHref,
  cars,
  customers,
  rules,
  defaults,
  paidSoFar = 0,
}: Parameters<typeof BookingForm>[0]) {
  const state = useFormState();
  const echoed = state.error ? state.values : undefined;

  const initialCar = Number(echoed?.carId ?? defaults.carId) || cars.find((c) => c.available)?.id;
  const [carId, setCarId] = useState<number | undefined>(
    cars.some((c) => c.id === initialCar && c.available) ? initialCar : undefined,
  );
  const car = cars.find((c) => c.id === carId);

  const [customerId, setCustomerId] = useState<string>(String(echoed?.customerId ?? defaults.customerId ?? ""));
  const [customerQuery, setCustomerQuery] = useState("");
  const customer = customers.find((c) => String(c.id) === customerId);

  const [terms, setTerms] = useState(() => ({
    securityDeposit: String(echoed?.securityDeposit ?? defaults.securityDeposit ?? car?.securityDeposit ?? 0),
    includedKmPerDay: String(echoed?.includedKmPerDay ?? defaults.includedKmPerDay ?? car?.includedKmPerDay ?? 300),
    extraKmRate: String(echoed?.extraKmRate ?? defaults.extraKmRate ?? car?.extraKmRate ?? 0),
    rateOverride: String(echoed?.rateOverride ?? defaults.rateOverride ?? ""),
    discountAmount: String(echoed?.discountAmount ?? defaults.discountAmount ?? 0),
    advanceAmount: String(echoed?.advanceAmount ?? 0),
    depositAmount: String(echoed?.depositAmount ?? 0),
  }));
  const set = (key: keyof typeof terms) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTerms((t) => ({ ...t, [key]: e.target.value }));

  const pickCar = (next: BookingCar) => {
    setCarId(next.id);
    setTerms((t) => ({
      ...t,
      securityDeposit: String(next.securityDeposit),
      includedKmPerDay: String(next.includedKmPerDay),
      extraKmRate: String(next.extraKmRate),
    }));
  };

  const pickupMs = parseDateTimeInput(pickup)?.getTime() ?? null;
  const returnMs = parseDateTimeInput(returnAt)?.getTime() ?? null;
  const pickupDate = pickupMs !== null ? new Date(pickupMs) : null;
  const returnDate = returnMs !== null ? new Date(returnMs) : null;

  const quote =
    !car || pickupMs === null || returnMs === null || returnMs <= pickupMs
      ? null
      : quoteRental(
      {
        id: car.id,
        dailyRate: car.dailyRate,
        includedKmPerDay: num(terms.includedKmPerDay),
        extraKmRate: num(terms.extraKmRate),
        securityDeposit: num(terms.securityDeposit),
      },
          rules,
          new Date(pickupMs),
          new Date(returnMs),
        );

  const override = terms.rateOverride.trim() !== "" ? num(terms.rateOverride) : null;
  const rental = quote ? (override !== null ? round2(override * quote.days) : quote.rentalAmount) : 0;
  const discount = num(terms.discountAmount);
  const total = round2(Math.max(0, rental - discount));
  const advance = num(terms.advanceAmount);
  const balance = round2(total - paidSoFar - advance);

  const groups = new Map<string, { source: string; rate: number; days: number }>();
  for (const line of quote?.lines ?? []) {
    const key = `${line.source}|${line.rate}`;
    const g = groups.get(key) ?? { source: line.source, rate: line.rate, days: 0 };
    g.days += 1;
    groups.set(key, g);
  }
  const rateGroups = [...groups.values()];

  const q = customerQuery.trim().toLowerCase();
  const matching = q
    ? customers.filter(
        (c) => c.fullName.toLowerCase().includes(q) || c.mobile.includes(q) || c.customerCode.toLowerCase().includes(q),
      )
    : customers;
  // Keep the chosen customer visible even when it doesn't match the filter.
  const filteredCustomers = customer && !matching.includes(customer) ? [customer, ...matching] : matching;

  const licenceProblem =
    customer?.licenseExpiry && returnDate && new Date(customer.licenseExpiry) < returnDate
      ? `Driving licence expires ${new Date(customer.licenseExpiry).toLocaleDateString("en-IN")} — before the return date.`
      : null;

  const availableCount = cars.filter((c) => c.available).length;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <input type="hidden" name="pickupAt" value={pickup} />
      <input type="hidden" name="returnAt" value={returnAt} />
      <input type="hidden" name="carId" value={carId ?? ""} />

      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Rental period</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {pickupDate && returnDate
                  ? `${formatShortDateTime(pickupDate)} → ${formatShortDateTime(returnDate)}`
                  : "Pick dates first"}
                {quote ? ` · ${quote.days} day${quote.days === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <Link href={changeDatesHref} className="text-xs font-medium text-primary hover:underline">
              Change dates
            </Link>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Pickup location" name="pickupLocation">
              <FInput name="pickupLocation" defaultValue={defaults.pickupLocation} placeholder="Office" />
            </FormField>
            <FormField label="Drop location" name="dropLocation">
              <FInput name="dropLocation" defaultValue={defaults.dropLocation} placeholder="Office" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Car</CardTitle>
            <span className="text-xs text-muted">
              {availableCount} of {cars.length} free for these dates
            </span>
          </CardHeader>
          <CardContent>
            {state.fieldErrors?.carId ? <p className="mb-3 text-xs text-danger">{state.fieldErrors.carId}</p> : null}
            {cars.length === 0 ? (
              <p className="text-sm text-muted">
                No active cars in the fleet. <Link href="/cars/new" className="text-primary hover:underline">Add a car</Link> first.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {cars.map((c) => {
                  const selected = c.id === carId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.available}
                      onClick={() => pickCar(c)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-primary bg-primary-soft" : "border-line hover:border-primary/50",
                        !c.available && "cursor-not-allowed opacity-50 hover:border-line",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                          selected ? "border-primary bg-primary text-primary-fg" : "border-line",
                        )}
                      >
                        {selected ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">
                            {c.company} {c.model}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">{formatMoney(c.dailyRate)}/day</span>
                        </span>
                        <span className="block font-mono text-[11px] text-muted">{c.registrationNumber}</span>
                        <span className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                          {[c.fuelType.toLowerCase(), c.transmission.toLowerCase(), c.seatingCapacity ? `${c.seatingCapacity} seats` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {!c.available ? (
                          <Badge tone="danger" className="mt-1.5">
                            {c.reason}
                          </Badge>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            {mode === "create" ? (
              <Link
                href="/customers/new?returnTo=booking"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <UserPlus className="size-3.5" /> New customer
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Filter by name, mobile or code…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
            <Select
              name="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              size={Math.min(7, Math.max(3, filteredCustomers.length + 1))}
              className={cn("h-auto py-1", state.fieldErrors?.customerId && "border-danger")}
            >
              <option value="" disabled>
                {filteredCustomers.length ? "Select a customer" : "No customers match"}
              </option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id} disabled={c.status === "BLACKLISTED"}>
                  {c.fullName} · {c.mobile}
                  {c.status === "BLACKLISTED" ? " (blacklisted)" : ""}
                </option>
              ))}
            </Select>
            {state.fieldErrors?.customerId ? <p className="text-xs text-danger">{state.fieldErrors.customerId}</p> : null}
            {licenceProblem ? (
              <p className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="size-4 shrink-0" /> {licenceProblem}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Rate override (₹/day)" name="rateOverride" hint="Blank = pricing rules">
              <Input name="rateOverride" type="number" step="0.01" min="0" value={terms.rateOverride} onChange={set("rateOverride")} />
            </FormField>
            <FormField label="Discount (₹)" name="discountAmount">
              <Input name="discountAmount" type="number" step="0.01" min="0" value={terms.discountAmount} onChange={set("discountAmount")} />
            </FormField>
            <FormField label="Security deposit (₹)" name="securityDeposit">
              <Input name="securityDeposit" type="number" step="0.01" min="0" value={terms.securityDeposit} onChange={set("securityDeposit")} />
            </FormField>
            <FormField label="Included km / day" name="includedKmPerDay" hint="0 = unlimited">
              <Input name="includedKmPerDay" type="number" min="0" value={terms.includedKmPerDay} onChange={set("includedKmPerDay")} />
            </FormField>
            <FormField label="Extra km rate (₹)" name="extraKmRate">
              <Input name="extraKmRate" type="number" step="0.01" min="0" value={terms.extraKmRate} onChange={set("extraKmRate")} />
            </FormField>
            <FormField label="Notes" name="notes" className="sm:col-span-3">
              <FTextarea name="notes" rows={2} defaultValue={defaults.notes} />
            </FormField>
          </CardContent>
        </Card>

        {mode === "create" ? (
          <Card>
            <CardHeader>
              <CardTitle>Collect now</CardTitle>
              <span className="text-xs text-muted">Optional — you can also collect at handover</span>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField label="Advance (₹)" name="advanceAmount">
                <Input name="advanceAmount" type="number" step="0.01" min="0" value={terms.advanceAmount} onChange={set("advanceAmount")} />
              </FormField>
              <FormField label="Paid via" name="advanceMode">
                <FSelect name="advanceMode" defaultValue="UPI" options={PAYMENT_MODE_OPTIONS} />
              </FormField>
              <FormField label="Reference / UTR" name="advanceReference">
                <FInput name="advanceReference" />
              </FormField>
              <FormField label="Security deposit (₹)" name="depositAmount">
                <Input name="depositAmount" type="number" step="0.01" min="0" value={terms.depositAmount} onChange={set("depositAmount")} />
              </FormField>
              <FormField label="Deposit via" name="depositMode">
                <FSelect name="depositMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
              </FormField>
              <FormField label="Reference" name="depositReference">
                <FInput name="depositReference" />
              </FormField>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="xl:sticky xl:top-20 xl:h-fit">
        <Card>
          <CardHeader>
            <CardTitle>Price</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!car ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted">
                <CarIcon className="size-4" /> Choose a car to see the price.
              </p>
            ) : quote ? (
              <>
                <div className="space-y-1 text-sm">
                  {override !== null ? (
                    <Row label={`${quote.days} × ${formatMoney(override)} (override)`} value={formatMoney(rental)} />
                  ) : (
                    rateGroups.map((g) => (
                      <Row
                        key={`${g.source}-${g.rate}`}
                        label={`${g.days} × ${formatMoney(g.rate)} · ${g.source}`}
                        value={formatMoney(g.days * g.rate)}
                      />
                    ))
                  )}
                  {discount > 0 ? <Row label="Discount" value={`− ${formatMoney(discount)}`} /> : null}
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <span className="text-sm font-medium">Booking total</span>
                  <span className="text-2xl font-semibold tabular-nums">{formatMoney(total)}</span>
                </div>
                <div className="space-y-1 text-sm text-muted">
                  {paidSoFar > 0 ? <Row label="Already paid" value={formatMoney(paidSoFar)} /> : null}
                  {advance > 0 ? <Row label="Advance now" value={formatMoney(advance)} /> : null}
                  <Row label="Balance at return" value={formatMoney(balance)} strong />
                  <Row label="Security deposit" value={formatMoney(num(terms.securityDeposit))} />
                  <Row
                    label="Km allowance"
                    value={quote.includedKm === null ? "Unlimited" : `${quote.includedKm} km, then ${formatMoney(num(terms.extraKmRate))}/km`}
                  />
                </div>
                {discount > rental ? <p className="text-xs text-danger">Discount is more than the rental.</p> : null}
                {advance > total ? <p className="text-xs text-danger">Advance is more than the total.</p> : null}
              </>
            ) : (
              <p className="py-4 text-sm text-danger">The return time must be after pickup.</p>
            )}

            <div className="space-y-2 border-t border-line pt-3">
              {mode === "create" ? (
                <>
                  <SubmitButton name="intent" value="confirm" className="w-full" disabled={!car || !customerId}>
                    Confirm booking
                  </SubmitButton>
                  <SubmitButton
                    name="intent"
                    value="quotation"
                    variant="outline"
                    className="w-full"
                    disabled={!car || !customerId}
                  >
                    Save as quotation
                  </SubmitButton>
                </>
              ) : (
                <SubmitButton className="w-full" disabled={!car || !customerId}>
                  Save changes
                </SubmitButton>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", strong && "font-medium text-fg")}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
