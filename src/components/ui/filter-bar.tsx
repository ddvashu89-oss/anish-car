import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";

/** A plain GET form: filters live in the URL, so any filtered view can be bookmarked or shared. */
export function FilterBar({
  action,
  children,
  resetHref,
}: {
  action: string;
  children: React.ReactNode;
  resetHref?: string;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      {children}
      <button
        type="submit"
        className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
      >
        Apply
      </button>
      {resetHref ? (
        <Link href={resetHref} className="inline-flex h-10 items-center px-2 text-sm text-muted hover:text-fg">
          Reset
        </Link>
      ) : null}
    </form>
  );
}

export function SearchInput({
  defaultValue,
  placeholder = "Search…",
  name = "q",
}: {
  defaultValue?: string;
  placeholder?: string;
  name?: string;
}) {
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function FilterSelect({
  name,
  defaultValue,
  options,
  placeholder,
  label,
}: {
  name: string;
  defaultValue?: string;
  options: Array<{ value: string | number; label: string }>;
  placeholder: string;
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label ? <span className="text-[11px] text-muted">{label}</span> : null}
      <Select name={name} defaultValue={defaultValue ?? ""} className="w-auto min-w-40">
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function FilterDate({ name, defaultValue, label }: { name: string; defaultValue?: string; label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <Input type="date" name={name} defaultValue={defaultValue} className="w-auto" />
    </label>
  );
}
