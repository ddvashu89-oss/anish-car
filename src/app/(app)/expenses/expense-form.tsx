import type { FormState } from "@/lib/actions/types";
import { toDateInput } from "@/lib/dates";
import { PAYMENT_MODE_OPTIONS } from "@/lib/status";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { ActionForm, FInput, FormField, FSelect, FTextarea, SubmitButton } from "@/components/form/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export function ExpenseForm({
  action,
  categories,
  cars,
  vendors,
  expense,
  defaults,
  cancelHref,
  returnTo,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: Array<{ value: number; label: string }>;
  cars: Array<{ value: number; label: string }>;
  vendors: string[];
  expense?: {
    expenseDate: Date;
    categoryId: number;
    carId: number | null;
    amount: unknown;
    paymentMode: string;
    referenceNo: string | null;
    vendorName: string | null;
    description: string | null;
    billUrl: string | null;
  };
  defaults: { carId?: number; date: string };
  cancelHref: string;
  returnTo?: string;
}) {
  return (
    <ActionForm action={action} className="max-w-3xl">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Date" name="expenseDate" required>
            <FInput name="expenseDate" type="date" defaultValue={expense ? toDateInput(expense.expenseDate) : defaults.date} />
          </FormField>
          <FormField label="Amount (₹)" name="amount" required>
            <FInput name="amount" type="number" step="0.01" min="0" defaultValue={expense ? String(expense.amount) : ""} autoFocus />
          </FormField>
          <FormField label="Category" name="categoryId" required>
            <FSelect name="categoryId" defaultValue={expense?.categoryId} placeholder="Select…" options={categories} />
          </FormField>
          <FormField label="Car" name="carId" hint="Leave blank for general business expenses">
            <FSelect name="carId" defaultValue={expense?.carId ?? defaults.carId} placeholder="Not for a specific car" options={cars} />
          </FormField>
          <FormField label="Paid via" name="paymentMode">
            <FSelect name="paymentMode" defaultValue={expense?.paymentMode ?? "CASH"} options={PAYMENT_MODE_OPTIONS} />
          </FormField>
          <FormField label="Reference / bill no." name="referenceNo">
            <FInput name="referenceNo" defaultValue={expense?.referenceNo} />
          </FormField>
          <FormField label="Vendor" name="vendorName" hint="Pick an existing one or type a new name">
            <FInput name="vendorName" list="vendor-list" defaultValue={expense?.vendorName} />
            <datalist id="vendor-list">
              {vendors.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Bill photo" name="bill" hint={expense?.billUrl ? "Choose only to replace the current bill" : "JPG, PNG or PDF, up to 5 MB"}>
            <FInput name="bill" type="file" accept={UPLOAD_ACCEPT} capture="environment" />
          </FormField>
          <FormField label="Description" name="description" className="sm:col-span-2">
            <FTextarea name="description" rows={2} defaultValue={expense?.description} />
          </FormField>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <SubmitButton>{expense ? "Save changes" : "Save expense"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
