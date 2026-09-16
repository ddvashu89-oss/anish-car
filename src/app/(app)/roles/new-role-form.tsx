"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createRoleAction } from "@/lib/actions/role-actions";
import type { FormState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create role"}
    </Button>
  );
}

export function NewRoleForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createRoleAction, {});

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>New role</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}

          <Field label="Role name" htmlFor="label" error={state.fieldErrors?.label}>
            <Input id="label" name="label" placeholder="Accountant" required />
          </Field>

          <Field label="Description" htmlFor="description" error={state.fieldErrors?.description}>
            <Textarea id="description" name="description" rows={3} placeholder="What this role is for" />
          </Field>

          <SubmitButton />
          <p className="text-xs text-muted">You will pick permissions on the next screen.</p>
        </form>
      </CardContent>
    </Card>
  );
}
