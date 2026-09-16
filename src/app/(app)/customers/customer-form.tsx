import type { FormState } from "@/lib/actions/types";
import { toDateInput } from "@/lib/dates";
import { ID_PROOF_TYPES } from "@/lib/documents";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import {
  ActionForm,
  FInput,
  FormField,
  FSelect,
  FTextarea,
  SubmitButton,
} from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

type Customer = {
  fullName: string;
  mobile: string;
  altMobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  drivingLicenseNo: string | null;
  licenseExpiry: Date | null;
  idProofType: string | null;
  idProofNumber: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  customerType: string;
  status: string;
  blacklistReason: string | null;
  notes: string | null;
};

export function CustomerForm({
  action,
  customer,
  cancelHref,
  submitLabel,
  returnTo,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customer?: Customer;
  cancelHref: string;
  submitLabel: string;
  returnTo?: string;
}) {
  const c = customer;
  return (
    <ActionForm action={action} className="max-w-4xl">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" name="fullName" required>
            <FInput name="fullName" defaultValue={c?.fullName} autoFocus={!c} />
          </FormField>
          <FormField label="Mobile" name="mobile" required hint="10 digits — used to find the customer later">
            <FInput name="mobile" inputMode="tel" defaultValue={c?.mobile} />
          </FormField>
          <FormField label="Alternate mobile" name="altMobile">
            <FInput name="altMobile" inputMode="tel" defaultValue={c?.altMobile} />
          </FormField>
          <FormField label="Email" name="email">
            <FInput name="email" type="email" defaultValue={c?.email} />
          </FormField>
          <FormField label="Address" name="address" className="sm:col-span-2">
            <FTextarea name="address" rows={2} defaultValue={c?.address} />
          </FormField>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <FormField label="City" name="city">
              <FInput name="city" defaultValue={c?.city} />
            </FormField>
            <FormField label="State" name="state">
              <FInput name="state" defaultValue={c?.state} />
            </FormField>
            <FormField label="PIN code" name="pincode">
              <FInput name="pincode" inputMode="numeric" defaultValue={c?.pincode} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licence & identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Driving licence number" name="drivingLicenseNo">
            <FInput name="drivingLicenseNo" defaultValue={c?.drivingLicenseNo} className="uppercase" />
          </FormField>
          <FormField label="Licence expiry" name="licenseExpiry" hint="You'll be reminded before it lapses">
            <FInput name="licenseExpiry" type="date" defaultValue={toDateInput(c?.licenseExpiry)} />
          </FormField>
          <FormField label="ID proof type" name="idProofType">
            <FSelect
              name="idProofType"
              defaultValue={c?.idProofType}
              placeholder="Select…"
              options={ID_PROOF_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </FormField>
          <FormField label="ID proof number" name="idProofNumber">
            <FInput name="idProofNumber" defaultValue={c?.idProofNumber} />
          </FormField>
          <FormField label="Emergency contact name" name="emergencyContactName">
            <FInput name="emergencyContactName" defaultValue={c?.emergencyContactName} />
          </FormField>
          <FormField label="Emergency contact mobile" name="emergencyContactPhone">
            <FInput name="emergencyContactPhone" inputMode="tel" defaultValue={c?.emergencyContactPhone} />
          </FormField>
          <FormField
            label="Customer photo"
            name="photo"
            hint={c ? "Choose a file only to replace the current photo" : "JPG, PNG or WebP, up to 5 MB"}
            className="sm:col-span-2"
          >
            <FInput name="photo" type="file" accept={UPLOAD_ACCEPT} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Customer type" name="customerType">
            <FSelect
              name="customerType"
              defaultValue={c?.customerType ?? "REGULAR"}
              options={[
                { value: "REGULAR", label: "Regular" },
                { value: "VIP", label: "VIP" },
                { value: "CORPORATE", label: "Corporate" },
              ]}
            />
          </FormField>
          <FormField label="Status" name="status">
            <FSelect
              name="status"
              defaultValue={c?.status ?? "ACTIVE"}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "BLACKLISTED", label: "Blacklisted — cannot be booked" },
              ]}
            />
          </FormField>
          <FormField label="Blacklist reason" name="blacklistReason" className="sm:col-span-2" hint="Required only when blacklisting">
            <FInput name="blacklistReason" defaultValue={c?.blacklistReason} />
          </FormField>
          <FormField label="Notes" name="notes" className="sm:col-span-2">
            <FTextarea name="notes" rows={3} defaultValue={c?.notes} />
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
