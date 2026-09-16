"use client";

import { useState } from "react";

import type { FormState } from "@/lib/actions/types";
import { billTotal, DAMAGE_PANELS, FUEL_LEVELS, HANDOVER_CHECKLIST, kmCharge, lateHours } from "@/lib/billing";
import { parseDateTimeInput } from "@/lib/dates";
import { PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { cn, formatKm, formatMoney, round2 } from "@/lib/utils";
import {
  ActionForm,
  FCheckbox,
  FInput,
  FormField,
  FSelect,
  FTextarea,
  SubmitButton,
  useFormState,
} from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryRow } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/link-button";

export type ReturnContext = {
  bookingId: number;
  scheduledReturn: string;
  startingKm: number;
  rentalDays: number;
  includedKmPerDay: number;
  extraKmRate: number;
  rentalAmount: number;
  existingDiscount: number;
  paidAmount: number;
  hourRate: number;
  graceMinutes: number;
  depositHeld: number;
  nowInput: string;
  uploadAccept: string;
};

const n = (v: string) => {
  const x = Number(v);
  return v.trim() === "" || !Number.isFinite(x) ? 0 : x;
};

export function ReturnForm({
  ctx,
  action,
}: {
  ctx: ReturnContext;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <Fields ctx={ctx} />
    </ActionForm>
  );
}

function Fields({ ctx }: { ctx: ReturnContext }) {
  const state = useFormState();
  const echo = state.error ? state.values : undefined;
  const [v, setV] = useState(() => ({
    returnedAt: echo?.returnedAt ?? ctx.nowInput,
    endingKm: echo?.endingKm ?? "",
    lateHours: echo?.lateHours ?? "",
    fuelAmount: echo?.fuelAmount ?? "0",
    damageAmount: echo?.damageAmount ?? "0",
    cleaningAmount: echo?.cleaningAmount ?? "0",
    otherAmount: echo?.otherAmount ?? "0",
    discountAmount: echo?.discountAmount ?? String(ctx.existingDiscount),
    paymentAmount: echo?.paymentAmount ?? "",
    depositAction: echo?.depositAction ?? (ctx.depositHeld > 0 ? "adjust" : "hold"),
  }));
  const on = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [key]: e.target.value }));

  const endingKm = v.endingKm === "" ? null : n(v.endingKm);
  const km =
    endingKm !== null
      ? kmCharge({
          startingKm: ctx.startingKm,
          endingKm,
          rentalDays: ctx.rentalDays,
          includedKmPerDay: ctx.includedKmPerDay,
          extraKmRate: ctx.extraKmRate,
        })
      : null;

  const returned = parseDateTimeInput(v.returnedAt);
  const autoLate = returned ? lateHours(new Date(ctx.scheduledReturn), returned, ctx.graceMinutes) : 0;
  const late = v.lateHours.trim() === "" ? autoLate : Math.max(0, Math.floor(n(v.lateHours)));
  const lateFee = round2(late * ctx.hourRate);

  const charges = {
    rentalAmount: ctx.rentalAmount,
    extraKmAmount: km?.extraKmAmount ?? 0,
    lateFeeAmount: lateFee,
    fuelAmount: n(v.fuelAmount),
    damageAmount: n(v.damageAmount),
    cleaningAmount: n(v.cleaningAmount),
    otherAmount: n(v.otherAmount),
    discountAmount: n(v.discountAmount),
  };
  const total = billTotal(charges);
  const balance = round2(total - ctx.paidAmount);
  const paying = n(v.paymentAmount);
  const afterPayment = round2(balance - paying);
  const adjust = v.depositAction === "adjust" ? round2(Math.min(ctx.depositHeld, Math.max(0, afterPayment))) : 0;
  const remaining = round2(afterPayment - adjust);
  const depositBack =
    v.depositAction === "refund" || v.depositAction === "adjust" ? round2(ctx.depositHeld - adjust) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle in</CardTitle>
            <span className="text-xs text-muted">Went out at {formatKm(ctx.startingKm)}</span>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Returned at" name="returnedAt" required>
              <Input name="returnedAt" type="datetime-local" value={v.returnedAt} onChange={on("returnedAt")} />
            </FormField>
            <FormField label="Odometer (km)" name="endingKm" required>
              <Input
                name="endingKm"
                type="number"
                min={ctx.startingKm}
                inputMode="numeric"
                value={v.endingKm}
                onChange={on("endingKm")}
                autoFocus
                className={cn(state.fieldErrors?.endingKm && "border-danger")}
              />
            </FormField>
            <FormField label="Fuel level" name="fuelLevel">
              <FSelect name="fuelLevel" defaultValue="Full" options={FUEL_LEVELS.map((f) => ({ value: f, label: f }))} />
            </FormField>
            <FormField
              label="Late hours"
              name="lateHours"
              hint={`Auto: ${autoLate} h after ${ctx.graceMinutes} min grace · ${formatMoney(ctx.hourRate)}/h`}
            >
              <Input name="lateHours" type="number" min="0" placeholder={String(autoLate)} value={v.lateHours} onChange={on("lateHours")} />
            </FormField>
            <div className="flex items-end pb-2 sm:col-span-2">
              <FCheckbox name="sendToService" label="Send the car to service instead of making it available" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {HANDOVER_CHECKLIST.map((item) => (
                <FCheckbox key={item} name="checklist" value={item} label={item} defaultChecked />
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">New damage found</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {DAMAGE_PANELS.map((panel) => (
                  <FCheckbox key={panel} name="newDamage" value={panel} label={panel} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Damage severity" name="damageSeverity">
                <FSelect
                  name="damageSeverity"
                  defaultValue="MINOR"
                  options={[
                    { value: "MINOR", label: "Minor" },
                    { value: "MODERATE", label: "Moderate" },
                    { value: "MAJOR", label: "Major" },
                  ]}
                />
              </FormField>
              <FormField label="Notes" name="damageNotes" className="sm:col-span-2">
                <FTextarea name="damageNotes" rows={2} />
              </FormField>
            </div>
            <FormField label="Photos" name="photos" hint="Up to 10 photos, 5 MB each">
              <FInput name="photos" type="file" accept={ctx.uploadAccept} multiple capture="environment" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extra charges</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["fuelAmount", "Fuel (₹)"],
                ["damageAmount", "Damage (₹)"],
                ["cleaningAmount", "Cleaning (₹)"],
                ["otherAmount", "Other — tolls, challans (₹)"],
                ["discountAmount", "Discount (₹)"],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} label={label} name={key}>
                <Input name={key} type="number" step="0.01" min="0" value={v[key]} onChange={on(key)} />
              </FormField>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Collect now (₹)" name="paymentAmount" hint={balance > 0 ? `Balance ${formatMoney(balance)}` : "Nothing due"}>
              <Input
                name="paymentAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder={balance > 0 ? String(balance) : "0"}
                value={v.paymentAmount}
                onChange={on("paymentAmount")}
              />
            </FormField>
            <FormField label="Paid via" name="paymentMode">
              <FSelect name="paymentMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
            </FormField>
            <FormField label="Reference / UTR" name="paymentReference">
              <FInput name="paymentReference" />
            </FormField>
            {ctx.depositHeld > 0 ? (
              <>
                <FormField label={`Deposit held: ${formatMoney(ctx.depositHeld)}`} name="depositAction" className="sm:col-span-2">
                  <Select name="depositAction" value={v.depositAction} onChange={on("depositAction")}>
                    <option value="adjust">Use it for any balance, return the rest</option>
                    <option value="refund">Return it in full (balance already paid)</option>
                    <option value="hold">Keep holding it for now</option>
                  </Select>
                </FormField>
                <FormField label="Return deposit via" name="refundMode">
                  <FSelect name="refundMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
                </FormField>
              </>
            ) : (
              <input type="hidden" name="depositAction" value="hold" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:h-fit">
        <Card>
          <CardHeader>
            <CardTitle>Final bill</CardTitle>
          </CardHeader>
          <CardContent>
            <SummaryRow label={`Rental (${ctx.rentalDays} day${ctx.rentalDays === 1 ? "" : "s"})`} value={formatMoney(ctx.rentalAmount)} />
            {km ? (
              <SummaryRow
                label={
                  km.includedKm === null
                    ? `${formatKm(km.totalKm)} driven · unlimited`
                    : `${formatKm(km.totalKm)} driven · ${formatKm(km.extraKm)} extra`
                }
                value={formatMoney(km.extraKmAmount)}
              />
            ) : (
              <SummaryRow label="Extra km" value="enter odometer" muted />
            )}
            {lateFee > 0 ? <SummaryRow label={`Late ${late} h`} value={formatMoney(lateFee)} /> : null}
            {charges.fuelAmount > 0 ? <SummaryRow label="Fuel" value={formatMoney(charges.fuelAmount)} /> : null}
            {charges.damageAmount > 0 ? <SummaryRow label="Damage" value={formatMoney(charges.damageAmount)} /> : null}
            {charges.cleaningAmount > 0 ? <SummaryRow label="Cleaning" value={formatMoney(charges.cleaningAmount)} /> : null}
            {charges.otherAmount > 0 ? <SummaryRow label="Other" value={formatMoney(charges.otherAmount)} /> : null}
            {charges.discountAmount > 0 ? <SummaryRow label="Discount" value={`− ${formatMoney(charges.discountAmount)}`} negative /> : null}
            <SummaryRow label="Total" value={formatMoney(total)} strong />
            <SummaryRow label="Already paid" value={formatMoney(ctx.paidAmount)} muted />
            <SummaryRow label="Balance" value={formatMoney(balance)} strong />
            {paying > 0 ? <SummaryRow label="Collecting now" value={`− ${formatMoney(paying)}`} /> : null}
            {adjust > 0 ? <SummaryRow label="From deposit" value={`− ${formatMoney(adjust)}`} /> : null}
            {depositBack > 0 ? <SummaryRow label="Deposit returned" value={formatMoney(depositBack)} muted /> : null}
            <SummaryRow
              label="Still to collect"
              value={<span className={remaining > 0.009 ? "text-danger" : "text-success"}>{formatMoney(Math.max(0, remaining))}</span>}
              strong
            />
            {paying > Math.max(0, balance) + 0.009 ? <p className="mt-2 text-xs text-danger">Collecting more than the balance.</p> : null}
            {v.depositAction === "refund" && afterPayment > 0.009 ? (
              <p className="mt-2 text-xs text-danger">Balance is still due — adjust from the deposit or hold it.</p>
            ) : null}
            {remaining <= 0.009 && (ctx.depositHeld === 0 || v.depositAction !== "hold") ? (
              <p className="mt-2 text-xs text-success">Fully settled — the booking will close automatically.</p>
            ) : null}

            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <SubmitButton className="w-full" size="lg" disabled={endingKm === null}>
                Complete return
              </SubmitButton>
              <LinkButton href={`/bookings/${ctx.bookingId}`} variant="ghost" className="w-full">
                Cancel
              </LinkButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
