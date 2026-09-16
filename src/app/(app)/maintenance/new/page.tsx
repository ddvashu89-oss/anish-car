import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMaintenanceAction } from "@/lib/actions/maintenance-actions";
import { todayKeyIST } from "@/lib/dates";
import { MAINTENANCE_TYPE_OPTIONS, PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
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
import { carOptions } from "../../documents/owners";
import { PartsEditor } from "../parts-editor";

export const metadata: Metadata = { title: "Log service · Anish Car Rent" };

export default async function NewMaintenancePage({ searchParams }: { searchParams: Promise<{ carId?: string }> }) {
  await requirePermission("maintenance.create");
  const carId = Number((await searchParams).carId) || undefined;

  const [cars, car, garages] = await Promise.all([
    carOptions(),
    carId ? prisma.car.findUnique({ where: { id: carId } }) : null,
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Log service or repair"
        description="Saves the service history, records the expense, and moves the next-service reminder."
      />
      <ActionForm action={createMaintenanceAction} className="max-w-4xl">
        {carId ? <input type="hidden" name="returnTo" value="car" /> : null}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Car" name="carId" required className="sm:col-span-3">
              <FSelect name="carId" defaultValue={carId} placeholder="Select a car…" options={cars} />
            </FormField>
            <FormField label="Service date" name="serviceDate" required>
              <FInput name="serviceDate" type="date" defaultValue={todayKeyIST()} />
            </FormField>
            <FormField label="Odometer (km)" name="km" required hint={car ? `Last recorded ${car.currentKm} km` : undefined}>
              <FInput name="km" type="number" min="0" defaultValue={car?.currentKm} />
            </FormField>
            <FormField label="Type" name="serviceType">
              <FSelect name="serviceType" defaultValue="GENERAL_SERVICE" options={MAINTENANCE_TYPE_OPTIONS} />
            </FormField>
            <FormField label="Garage" name="garageName" className="sm:col-span-2">
              <FInput name="garageName" list="garage-list" placeholder="Authorised service centre" />
              <datalist id="garage-list">
                {garages.map((g) => (
                  <option key={g.name} value={g.name} />
                ))}
              </datalist>
            </FormField>
            <FormField label="Paid via" name="paymentMode">
              <FSelect name="paymentMode" defaultValue="CASH" options={PAYMENT_MODE_OPTIONS} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parts & labour</CardTitle>
          </CardHeader>
          <CardContent>
            <PartsEditor />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next service</CardTitle>
            <span className="text-xs text-muted">
              {car?.serviceIntervalKm
                ? `Blank = this reading + ${car.serviceIntervalKm} km for a general service`
                : "Set a target so you get reminded"}
            </span>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Next service at (km)" name="nextServiceKm">
              <FInput name="nextServiceKm" type="number" min="0" />
            </FormField>
            <FormField label="Or by date" name="nextServiceDate">
              <FInput name="nextServiceDate" type="date" />
            </FormField>
            <FormField label="Bill" name="bill">
              <FInput name="bill" type="file" accept={UPLOAD_ACCEPT} capture="environment" />
            </FormField>
            <FormField label="Notes" name="notes" className="sm:col-span-3">
              <FTextarea name="notes" rows={2} />
            </FormField>
            {car?.status === "SERVICE" || !carId ? (
              <div className="sm:col-span-3">
                <FCheckbox name="markAvailable" label="The car is back — mark it available for rent" defaultChecked />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <SubmitButton>Save service</SubmitButton>
          <LinkButton href={carId ? `/cars/${carId}?tab=maintenance` : "/maintenance"} variant="ghost">
            Cancel
          </LinkButton>
        </div>
      </ActionForm>
    </>
  );
}
