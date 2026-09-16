"use client";

import * as React from "react";
import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import type { FormState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const FormCtx = createContext<FormState>({});

export function useFormState() {
  return useContext(FormCtx);
}

/**
 * A <form> bound to a server action. Children can be server-rendered markup; the F* controls
 * below read the submitted values back so a failed save never wipes what was typed.
 */
export function ActionForm({
  action,
  children,
  className,
  showSuccess = true,
  onSuccess,
  id,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  showSuccess?: boolean;
  onSuccess?: () => void;
  id?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const lastOk = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.okAt && state.okAt !== lastOk.current) {
      lastOk.current = state.okAt;
      onSuccess?.();
    }
  }, [state.okAt, onSuccess]);

  return (
    <FormCtx.Provider value={state}>
      <form id={id} action={formAction} className={cn("space-y-4", className)} noValidate>
        <FormMessage showSuccess={showSuccess} />
        {children}
      </form>
    </FormCtx.Provider>
  );
}

export function FormMessage({ showSuccess = true }: { showSuccess?: boolean }) {
  const state = useFormState();
  if (state.error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  }
  if (state.success && showSuccess) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success">
        <CheckCircle2 className="size-4 shrink-0" />
        {state.success}
      </p>
    );
  }
  return null;
}

function useEcho(name: string, fallback: string | number | null | undefined) {
  const state = useFormState();
  if (state.values && name in state.values) return state.values[name];
  if (state.values && state.error) return "";
  return fallback == null ? "" : String(fallback);
}

export function FieldError({ name }: { name: string }) {
  const state = useFormState();
  const message = state.fieldErrors?.[name];
  return message ? <p className="text-xs text-danger">{message}</p> : null;
}

export function FormField({
  label,
  name,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

type FInputProps = Omit<React.ComponentProps<"input">, "name" | "defaultValue"> & {
  name: string;
  defaultValue?: string | number | null;
};

export function FInput({ name, defaultValue, className, type, ...props }: FInputProps) {
  const value = useEcho(name, defaultValue);
  const state = useFormState();
  if (type === "file") {
    return <Input id={name} name={name} type="file" className={cn("py-1.5", className)} {...props} />;
  }
  return (
    <Input
      id={props.id ?? name}
      name={name}
      type={type}
      defaultValue={value}
      aria-invalid={Boolean(state.fieldErrors?.[name]) || undefined}
      className={cn(state.fieldErrors?.[name] && "border-danger", className)}
      {...props}
    />
  );
}

type FTextareaProps = Omit<React.ComponentProps<"textarea">, "name" | "defaultValue"> & {
  name: string;
  defaultValue?: string | null;
};

export function FTextarea({ name, defaultValue, ...props }: FTextareaProps) {
  const value = useEcho(name, defaultValue);
  return <Textarea id={props.id ?? name} name={name} defaultValue={value} {...props} />;
}

type FSelectProps = Omit<React.ComponentProps<"select">, "name" | "defaultValue"> & {
  name: string;
  defaultValue?: string | number | null;
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  placeholder?: string;
};

export function FSelect({ name, defaultValue, options, placeholder, className, ...props }: FSelectProps) {
  const value = useEcho(name, defaultValue);
  const state = useFormState();
  return (
    <Select
      id={props.id ?? name}
      name={name}
      defaultValue={value}
      className={cn(state.fieldErrors?.[name] && "border-danger", className)}
      {...props}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function FCheckbox({
  name,
  value = "on",
  label,
  defaultChecked,
}: {
  name: string;
  value?: string;
  label: string;
  defaultChecked?: boolean;
}) {
  const state = useFormState();
  const checked =
    state.values && state.error ? (state.values[name] ?? "").split(",").includes(value) : Boolean(defaultChecked);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * One-click action (delete, cancel, mark read…) with an optional confirm prompt.
 * Errors show next to the button instead of crashing the page.
 */
export function ActionButton({
  action,
  fields,
  confirm,
  children,
  variant = "ghost",
  size = "sm",
  className,
  pendingText,
}: {
  action: Action;
  fields?: Record<string, string | number>;
  confirm?: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  pendingText?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const showError = state.error && dismissed !== state;

  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {fields
        ? Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      <SubmitButton variant={variant} size={size} className={className} pendingText={pendingText ?? "Working…"}>
        {children}
      </SubmitButton>
      {showError ? (
        <button
          type="button"
          onClick={() => setDismissed(state)}
          className="max-w-64 rounded-md bg-danger-soft px-2 py-1 text-left text-xs text-danger"
          title="Dismiss"
        >
          {state.error}
        </button>
      ) : null}
    </form>
  );
}
