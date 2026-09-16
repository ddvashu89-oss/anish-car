import type { FormState } from "@/lib/actions/types";
import { toDateInput } from "@/lib/dates";
import { FUEL_TYPE_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/status";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { ActionForm, FInput, FormField, FSelect, FTextarea, SubmitButton } from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

type Car = {
  registrationNumber: string;
  company: string;
  model: string;
  variant: string | null;
  year: number | null;
  colour: string | null;
  fuelType: string;
  transmission: string;
  seatingCapacity: number | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  currentKm: number;
  purchaseDate: Date | null;
  purchasePrice: unknown;
  dailyRate: unknown;
  includedKmPerDay: number;
  extraKmRate: unknown;
  extraHourRate: unknown;
  securityDeposit: unknown;
  serviceIntervalKm: number | null;
  serviceDueKm: number | null;
  nextServiceDate: Date | null;
  notes: string | null;
};

const s = (v: unknown) => (v == null ? "" : String(v));

export function CarForm({
  action,
  car,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  car?: Car;
  cancelHref: string;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Vehicle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Registration number" name="registrationNumber" required hint="e.g. HR26AB1234">
            <FInput name="registrationNumber" defaultValue={car?.registrationNumber} className="uppercase" autoFocus={!car} />
          </FormField>
          <FormField label="Make" name="company" required>
            <FInput name="company" defaultValue={car?.company} placeholder="Hyundai" />
          </FormField>
          <FormField label="Model" name="model" required>
            <FInput name="model" defaultValue={car?.model} placeholder="Verna" />
          </FormField>
          <FormField label="Variant" name="variant">
            <FInput name="variant" defaultValue={car?.variant} placeholder="SX (O)" />
          </FormField>
          <FormField label="Year" name="year">
            <FInput name="year" type="number" defaultValue={car?.year} />
          </FormField>
          <FormField label="Colour" name="colour">
            <FInput name="colour" defaultValue={car?.colour} />
          </FormField>
          <FormField label="Fuel" name="fuelType">
            <FSelect name="fuelType" defaultValue={car?.fuelType ?? "PETROL"} options={FUEL_TYPE_OPTIONS} />
          </FormField>
          <FormField label="Transmission" name="transmission">
            <FSelect name="transmission" defaultValue={car?.transmission ?? "MANUAL"} options={TRANSMISSION_OPTIONS} />
          </FormField>
          <FormField label="Seats" name="seatingCapacity">
            <FInput name="seatingCapacity" type="number" min="1" defaultValue={car?.seatingCapacity ?? 5} />
          </FormField>
          <FormField label="Chassis number" name="chassisNumber">
            <FInput name="chassisNumber" defaultValue={car?.chassisNumber} />
          </FormField>
          <FormField label="Engine number" name="engineNumber">
            <FInput name="engineNumber" defaultValue={car?.engineNumber} />
          </FormField>
          <FormField label="Current odometer (km)" name="currentKm" required>
            <FInput name="currentKm" type="number" min="0" defaultValue={car?.currentKm ?? 0} />
          </FormField>
          <FormField label="Purchase date" name="purchaseDate">
            <FInput name="purchaseDate" type="date" defaultValue={toDateInput(car?.purchaseDate)} />
          </FormField>
          <FormField label="Purchase price (₹)" name="purchasePrice">
            <FInput name="purchasePrice" type="number" step="0.01" min="0" defaultValue={s(car?.purchasePrice)} />
          </FormField>
          <FormField label="Photo" name="image" hint={car ? "Choose only to replace" : "Optional"}>
            <FInput name="image" type="file" accept={UPLOAD_ACCEPT} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rental terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Daily rate (₹)" name="dailyRate" required hint="Pricing rules can override this">
            <FInput name="dailyRate" type="number" step="0.01" min="0" defaultValue={s(car?.dailyRate)} />
          </FormField>
          <FormField label="Included km per day" name="includedKmPerDay" hint="0 = unlimited">
            <FInput name="includedKmPerDay" type="number" min="0" defaultValue={car?.includedKmPerDay ?? 300} />
          </FormField>
          <FormField label="Extra km rate (₹/km)" name="extraKmRate">
            <FInput name="extraKmRate" type="number" step="0.01" min="0" defaultValue={s(car?.extraKmRate ?? 10)} />
          </FormField>
          <FormField label="Late fee (₹/hour)" name="extraHourRate" hint="Blank = use the default in Settings">
            <FInput name="extraHourRate" type="number" step="0.01" min="0" defaultValue={s(car?.extraHourRate)} />
          </FormField>
          <FormField label="Security deposit (₹)" name="securityDeposit">
            <FInput name="securityDeposit" type="number" step="0.01" min="0" defaultValue={s(car?.securityDeposit ?? 0)} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Servicing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Service every (km)" name="serviceIntervalKm" hint="Used to plan the next service">
            <FInput name="serviceIntervalKm" type="number" min="0" defaultValue={car?.serviceIntervalKm ?? 10000} />
          </FormField>
          <FormField label="Next service at (km)" name="serviceDueKm" hint="Blank = odometer + interval">
            <FInput name="serviceDueKm" type="number" min="0" defaultValue={car?.serviceDueKm} />
          </FormField>
          <FormField label="Next service date" name="nextServiceDate">
            <FInput name="nextServiceDate" type="date" defaultValue={toDateInput(car?.nextServiceDate)} />
          </FormField>
          {!car ? (
            <FormField label="Starting status" name="status">
              <FSelect
                name="status"
                defaultValue="AVAILABLE"
                options={[
                  { value: "AVAILABLE", label: "Available" },
                  { value: "SERVICE", label: "In service" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </FormField>
          ) : null}
          <FormField label="Notes" name="notes" className="sm:col-span-3">
            <FTextarea name="notes" rows={2} defaultValue={car?.notes} />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
