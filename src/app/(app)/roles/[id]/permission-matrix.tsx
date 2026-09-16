"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";

import type { FormState } from "@/lib/actions/types";
import { ACTIONS, ACTION_LABELS, MODULES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </Button>
  );
}

export function PermissionMatrix({
  action,
  role,
  granted,
  readOnly,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  role: { name: string; label: string; description: string | null };
  granted: string[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const isAdmin = role.name === "admin";
  const [checked, setChecked] = useState<Set<string>>(new Set(granted));

  const toggle = (key: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleModule = (moduleKey: string, value: boolean) => {
    const mod = MODULES.find((m) => m.key === moduleKey);
    if (!mod) return;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const act of mod.actions) {
        const key = `${moduleKey}.${act}`;
        if (value) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const disabled = readOnly || isAdmin;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="size-4" />
          {state.success}
        </p>
      ) : null}

      {isAdmin ? (
        <p className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm text-primary">
          <Lock className="size-4 shrink-0" />
          Admin always holds every permission, including ones added by future updates.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" htmlFor="label" error={state.fieldErrors?.label}>
            <Input id="label" name="label" defaultValue={role.label} disabled={readOnly} required />
          </Field>
          <Field label="Description" htmlFor="description" error={state.fieldErrors?.description}>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={role.description ?? ""}
              disabled={readOnly}
            />
          </Field>
        </CardContent>
      </Card>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Module</Th>
              {ACTIONS.map((act) => (
                <Th key={act} className="text-center">
                  {ACTION_LABELS[act]}
                </Th>
              ))}
              <Th className="text-center">All</Th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod) => {
              const allOn = mod.actions.every((act) => isAdmin || checked.has(`${mod.key}.${act}`));
              return (
                <tr key={mod.key} className="hover:bg-surface-2/60">
                  <Td className="font-medium">{mod.label}</Td>
                  {ACTIONS.map((act) => {
                    const supported = mod.actions.includes(act);
                    const key = `${mod.key}.${act}`;
                    return (
                      <Td key={act} className="text-center">
                        {supported ? (
                          <input
                            type="checkbox"
                            name="permissions"
                            value={key}
                            checked={isAdmin || checked.has(key)}
                            disabled={disabled}
                            onChange={(event) => toggle(key, event.target.checked)}
                            aria-label={`${ACTION_LABELS[act]} ${mod.label}`}
                            className="size-4 accent-[var(--primary)]"
                          />
                        ) : (
                          <span className="text-muted/40">—</span>
                        )}
                      </Td>
                    );
                  })}
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      checked={allOn}
                      disabled={disabled}
                      onChange={(event) => toggleModule(mod.key, event.target.checked)}
                      aria-label={`All ${mod.label} permissions`}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {readOnly ? null : (
        <div className="flex items-center gap-2">
          <SubmitButton />
          <Link
            href="/roles"
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Back
          </Link>
        </div>
      )}
    </form>
  );
}
