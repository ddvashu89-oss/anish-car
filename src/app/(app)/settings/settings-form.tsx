import { updateSettingsAction } from "@/lib/actions/settings-actions";
import { ActionForm, FInput, FormField, FTextarea, SubmitButton } from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SettingRow = {
  key: string;
  value: string;
  group: string;
  valueType: string;
  label: string | null;
};

const GROUP_TITLES: Record<string, { title: string; description: string }> = {
  company: { title: "Business details", description: "Printed on invoices, receipts and agreements." },
  billing: { title: "Billing", description: "Late fees, tax and the terms printed on documents." },
  reminders: { title: "Reminder rules", description: "How early the notification centre warns you." },
};

export function SettingsForm({ groups, readOnly }: { groups: Record<string, SettingRow[]>; readOnly: boolean }) {
  return (
    <ActionForm action={updateSettingsAction}>
      {Object.entries(groups).map(([group, rows]) => {
        const meta = GROUP_TITLES[group] ?? { title: group, description: "" };
        return (
          <Card key={group}>
            <CardHeader>
              <div>
                <CardTitle>{meta.title}</CardTitle>
                {meta.description ? <p className="mt-0.5 text-xs text-muted">{meta.description}</p> : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {rows.map((row) => {
                const name = `setting:${row.key}`;
                const isText = row.valueType === "text";
                return (
                  <FormField key={row.key} className={isText ? "sm:col-span-2" : undefined} label={row.label ?? row.key} name={name}>
                    {isText ? (
                      <FTextarea name={name} rows={row.key.includes("agreement") ? 10 : 3} defaultValue={row.value} disabled={readOnly} />
                    ) : (
                      <FInput
                        name={name}
                        type={row.valueType === "number" ? "number" : "text"}
                        step={row.valueType === "number" ? "any" : undefined}
                        defaultValue={row.value}
                        disabled={readOnly}
                      />
                    )}
                  </FormField>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
      {readOnly ? null : <SubmitButton>Save settings</SubmitButton>}
    </ActionForm>
  );
}
