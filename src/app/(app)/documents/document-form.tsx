import type { FormState } from "@/lib/actions/types";
import { toDateInput } from "@/lib/dates";
import { CAR_DOCUMENT_TYPES, CUSTOMER_DOCUMENT_TYPES } from "@/lib/documents";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import {
  ActionForm,
  FCheckbox,
  FInput,
  FormField,
  FSelect,
  SubmitButton,
} from "@/components/form/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

type Doc = {
  documentType: string;
  documentNumber: string | null;
  issuedBy?: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  amount?: unknown;
  notes: string | null;
  fileUrl: string | null;
};

export function DocumentForm({
  action,
  kind,
  ownerId,
  owners,
  doc,
  cancelHref,
  returnTo,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  kind: "car" | "customer";
  ownerId?: number;
  owners: Array<{ value: number; label: string }>;
  doc?: Doc;
  cancelHref: string;
  returnTo?: string;
}) {
  const types = kind === "car" ? CAR_DOCUMENT_TYPES : CUSTOMER_DOCUMENT_TYPES;
  const ownerField = kind === "car" ? "carId" : "customerId";

  return (
    <ActionForm action={action} className="max-w-3xl">
      <input type="hidden" name="kind" value={kind} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label={kind === "car" ? "Car" : "Customer"} name={ownerField} required className="sm:col-span-2">
            <FSelect
              name={ownerField}
              defaultValue={ownerId}
              placeholder={kind === "car" ? "Select a car…" : "Select a customer…"}
              options={owners}
              disabled={Boolean(doc)}
            />
            {doc && ownerId ? <input type="hidden" name={ownerField} value={ownerId} /> : null}
          </FormField>

          <FormField label="Document type" name="documentType" required>
            <FSelect
              name="documentType"
              defaultValue={doc?.documentType ?? types[0]}
              options={[...new Set([...types, ...(doc ? [doc.documentType] : [])])].map((t) => ({ value: t, label: t }))}
            />
          </FormField>
          <FormField label="Document number" name="documentNumber">
            <FInput name="documentNumber" defaultValue={doc?.documentNumber} />
          </FormField>

          {kind === "car" ? (
            <FormField label="Issued by" name="issuedBy" hint="Insurer, RTO, PUC centre…" className="sm:col-span-2">
              <FInput name="issuedBy" defaultValue={doc?.issuedBy} />
            </FormField>
          ) : null}

          <FormField label="Issue date" name="issueDate">
            <FInput name="issueDate" type="date" defaultValue={toDateInput(doc?.issueDate)} />
          </FormField>
          <FormField label="Expiry date" name="expiryDate" hint="Leave blank if it never expires">
            <FInput name="expiryDate" type="date" defaultValue={toDateInput(doc?.expiryDate)} />
          </FormField>

          {kind === "car" ? (
            <>
              <FormField label="Amount paid (₹)" name="amount" hint="Premium or fee, if any">
                <FInput name="amount" type="number" step="0.01" min="0" defaultValue={doc?.amount ? String(doc.amount) : ""} />
              </FormField>
              {!doc ? (
                <div className="flex items-end pb-2">
                  <FCheckbox name="recordExpense" label="Also record this amount as a car expense" />
                </div>
              ) : null}
            </>
          ) : null}

          <FormField
            label="File"
            name="file"
            className="sm:col-span-2"
            hint={doc?.fileUrl ? "A file is attached — choose another only to replace it" : "Photo or PDF, up to 5 MB"}
          >
            <FInput name="file" type="file" accept={UPLOAD_ACCEPT} />
          </FormField>

          <FormField label="Notes" name="notes" className="sm:col-span-2">
            <FInput name="notes" defaultValue={doc?.notes} />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{doc ? "Save changes" : "Save document"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
