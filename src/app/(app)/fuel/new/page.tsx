import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createFuelAction } from "@/lib/actions/fuel-actions";
import { todayKeyIST } from "@/lib/dates";
import { PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { ActionForm, FCheckbox, FInput, FormField, FSelect, SubmitButton } from "@/components/form/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { carOptions } from "../../documents/owners";

export const metadata: Metadata = { title: "Add fuel · Anish Car Rent" };

export default async function NewFuelPage({ searchParams }: { searchParams: Promise<{ carId?: string }> }) {
  await requirePermission("fuel.create");
  const carId = Number((await searchParams).carId) || undefined;
  const [cars, car] = await Promise.all([carOptions(), carId ? prisma.car.findUnique({ where: { id: carId } }) : null]);

  return (
    <>
      <PageHeader title="Add fuel" description="Fill any two of litres, price and amount. Full-tank fills are used to work out mileage." />
      <ActionForm action={createFuelAction} className="max-w-3xl">
        {carId ? <input type="hidden" name="returnTo" value="car" /> : null}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Car" name="carId" required className="sm:col-span-3">
              <FSelect name="carId" defaultValue={carId} placeholder="Select a car…" options={cars} />
            </FormField>
            <FormField label="Date" name="filledAt" required>
              <FInput name="filledAt" type="date" defaultValue={todayKeyIST()} />
            </FormField>
            <FormField label="Odometer (km)" name="km" required hint={car ? `Last recorded ${car.currentKm} km` : undefined}>
              <FInput name="km" type="number" min="0" defaultValue={car?.currentKm} />
            </FormField>
            <FormField label="Litres" name="litres" required>
              <FInput name="litres" type="number" step="0.01" min="0" autoFocus={Boolean(carId)} />
            </FormField>
            <FormField label="Price per litre (₹)" name="pricePerLitre">
              <FInput name="pricePerLitre" type="number" step="0.01" min="0" />
            </FormField>
            <FormField label="Total amount (₹)" name="amount">
              <FInput name="amount" type="number" step="0.01" min="0" />
            </FormField>
            <FormField label="Paid via" name="paymentMode">
              <FSelect name="paymentMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
            </FormField>
            <FormField label="Fuel station" name="station" className="sm:col-span-2">
              <FInput name="station" />
            </FormField>
            <FormField label="Bill" name="bill">
              <FInput name="bill" type="file" accept={UPLOAD_ACCEPT} capture="environment" />
            </FormField>
            <div className="sm:col-span-3">
              <FCheckbox name="isFullTank" label="Filled to full tank" defaultChecked />
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center gap-2">
          <SubmitButton>Save fuel entry</SubmitButton>
          <LinkButton href={carId ? `/cars/${carId}?tab=fuel` : "/fuel"} variant="ghost">
            Cancel
          </LinkButton>
        </div>
      </ActionForm>
    </>
  );
}
