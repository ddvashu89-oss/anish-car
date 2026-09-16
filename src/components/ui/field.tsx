import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-colors focus:border-primary disabled:opacity-60";

// Defaulting id to name means a <Label htmlFor={name}> always associates correctly,
// without every call site having to repeat id={name} by hand.

export function Input({ className, id, name, ...props }: React.ComponentProps<"input">) {
  return <input id={id ?? name} name={name} className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, id, name, ...props }: React.ComponentProps<"textarea">) {
  return <textarea id={id ?? name} name={name} className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

export function Select({ className, id, name, ...props }: React.ComponentProps<"select">) {
  return <select id={id ?? name} name={name} className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
