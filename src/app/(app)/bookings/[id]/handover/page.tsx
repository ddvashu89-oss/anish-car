import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handoverAction } from "@/lib/actions/booking-actions";
import { DAMAGE_PANELS, FUEL_LEVELS, HANDOVER_CHECKLIST } from "@/lib/billing";
import { balanceDue, depositHeld } from "@/lib/bookings";
import { toDateTimeInput } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { formatDateTime, formatKm, formatMoney, round2, toNum } from "@/lib/utils";
import {
  ActionForm,
  FCheckbox,
  FInput,
  FormField,
  FSelect,
  FTextarea,
  SubmitButton,
} from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Hand over car · Anish Car Rent" };

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("returns.create");
  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) notFound();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { car: true, customer: true },
  });
  if (!booking) notFound();
  if (booking.status !== "CONFIRMED") redirect(`/bookings/${bookingId}`);

  const deposit = await depositHeld(bookingId);
  const depositStillDue = round2(Math.max(0, toNum(booking.securityDeposit) - deposit.collected));
  const due = balanceDue(booking);

  return (
    <>
      <PageHeader
        title={`Hand over ${booking.car.company} ${booking.car.model}`}
        description={`${booking.bookingNumber} · ${booking.customer.fullName} · due back ${formatDateTime(booking.returnAt)}`}
      />

      <ActionForm action={handoverAction.bind(null, bookingId)} className="max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle out</CardTitle>
            <span className="font-mono text-xs text-muted">{formatRegistration(booking.car.registrationNumber)}</span>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Handover time" name="handoverAt" required>
              <FInput name="handoverAt" type="datetime-local" defaultValue={toDateTimeInput(new Date())} />
            </FormField>
            <FormField label="Odometer (km)" name="startingKm" required hint={`Last recorded ${formatKm(booking.car.currentKm)}`}>
              <FInput name="startingKm" type="number" min={booking.car.currentKm} defaultValue={booking.car.currentKm} inputMode="numeric" />
            </FormField>
            <FormField label="Fuel level" name="fuelLevel">
              <FSelect name="fuelLevel" defaultValue="Full" options={FUEL_LEVELS.map((f) => ({ value: f, label: f }))} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {HANDOVER_CHECKLIST.map((item) => (
              <FCheckbox key={item} name="checklist" value={item} label={item} defaultChecked />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing damage</CardTitle>
            <span className="text-xs text-muted">Tick anything already damaged, so it isn&apos;t charged at return</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {DAMAGE_PANELS.map((panel) => (
                <FCheckbox key={panel} name="existingDamage" value={panel} label={panel} />
              ))}
            </div>
            <FormField label="Notes" name="damageNotes">
              <FTextarea name="damageNotes" rows={2} placeholder="Small scratch on the rear bumper, left side" />
            </FormField>
            <FormField label="Photos" name="photos" hint="Up to 10 photos, 5 MB each">
              <FInput name="photos" type="file" accept={UPLOAD_ACCEPT} multiple capture="environment" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collect at handover</CardTitle>
            <span className="text-xs text-muted">
              Balance {formatMoney(due)} · deposit collected {formatMoney(deposit.collected)} of {formatMoney(booking.securityDeposit)}
            </span>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Security deposit (₹)" name="depositAmount">
              <FInput name="depositAmount" type="number" step="0.01" min="0" defaultValue={depositStillDue} />
            </FormField>
            <FormField label="Deposit via" name="depositMode">
              <FSelect name="depositMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
            </FormField>
            <FormField label="Reference" name="depositReference">
              <FInput name="depositReference" />
            </FormField>
            <FormField label="Rental payment (₹)" name="advanceAmount" hint={due > 0 ? `Up to ${formatMoney(due)}` : "Fully paid"}>
              <FInput name="advanceAmount" type="number" step="0.01" min="0" max={Math.max(0, due)} defaultValue={0} />
            </FormField>
            <FormField label="Payment via" name="advanceMode">
              <FSelect name="advanceMode" defaultValue="UPI" options={PAYMENT_MODE_OPTIONS} />
            </FormField>
            <FormField label="Reference / UTR" name="advanceReference">
              <FInput name="advanceReference" />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <SubmitButton size="lg" pendingText="Saving…">
            Hand over car
          </SubmitButton>
          <LinkButton href={`/bookings/${bookingId}`} variant="ghost">
            Cancel
          </LinkButton>
        </div>
      </ActionForm>
    </>
  );
}
