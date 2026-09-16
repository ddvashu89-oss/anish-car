import type { FormState } from "@/lib/actions/types";
import { ActionForm, FInput, FormField, FSelect, SubmitButton } from "@/components/form/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export type UserFormValues = {
  name: string;
  email: string;
  mobile: string;
  roleId: number;
  status: string;
  joiningDate: string;
};

export function UserForm({
  action,
  roles,
  defaults,
  submitLabel,
  isEdit = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roles: Array<{ id: number; label: string; description: string | null }>;
  defaults?: Partial<UserFormValues>;
  submitLabel: string;
  isEdit?: boolean;
}) {
  return (
    <ActionForm action={action} className="max-w-2xl">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" name="name" required>
            <FInput name="name" defaultValue={defaults?.name} />
          </FormField>
          <FormField label="Email" name="email" required hint="Used to sign in">
            <FInput name="email" type="email" defaultValue={defaults?.email} autoComplete="off" />
          </FormField>
          <FormField label="Mobile" name="mobile" hint="10 digits, optional">
            <FInput name="mobile" inputMode="numeric" defaultValue={defaults?.mobile} />
          </FormField>
          <FormField label="Joining date" name="joiningDate">
            <FInput name="joiningDate" type="date" defaultValue={defaults?.joiningDate} />
          </FormField>
          <FormField label="Role" name="roleId" required>
            <FSelect
              name="roleId"
              defaultValue={defaults?.roleId ?? roles.find((r) => r.label === "Staff")?.id}
              options={roles.map((r) => ({ value: r.id, label: r.label }))}
            />
          </FormField>
          <FormField label="Status" name="status">
            <FSelect
              name="status"
              defaultValue={defaults?.status ?? "ACTIVE"}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "SUSPENDED", label: "Suspended" },
              ]}
            />
          </FormField>
          <FormField
            className="sm:col-span-2"
            label={isEdit ? "New password" : "Password"}
            name="password"
            required={!isEdit}
            hint={
              isEdit
                ? "Leave blank to keep the current password. Changing it signs the user out everywhere."
                : "At least 8 characters, with a letter and a number."
            }
          >
            <FInput name="password" type="password" autoComplete="new-password" />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href="/users" variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
