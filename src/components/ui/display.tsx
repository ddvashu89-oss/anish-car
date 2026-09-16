import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
        <Icon className="size-5" />
      </span>
      <p className="mt-1 font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: Array<{ label: string; value: React.ReactNode; hidden?: boolean }>;
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 text-sm",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="mt-0.5 break-words">{item.value ?? "—"}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Compact KPI used inside profile headers. */
export function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "danger" | "warning" | "primary";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SummaryRow({
  label,
  value,
  strong,
  muted,
  negative,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-1.5 text-sm",
        strong && "border-t border-line pt-2.5 text-base font-semibold",
        muted && "text-muted",
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", negative && "text-success")}>{value}</span>
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{ id: string; title: React.ReactNode; meta?: React.ReactNode; when: React.ReactNode; tone?: string }>;
}) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className={cn(
              "absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface",
              item.tone === "success"
                ? "bg-success"
                : item.tone === "danger"
                  ? "bg-danger"
                  : item.tone === "warning"
                    ? "bg-warning"
                    : "bg-primary",
            )}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <p className="text-sm">{item.title}</p>
            <p className="text-xs text-muted">{item.when}</p>
          </div>
          {item.meta ? <p className="mt-0.5 text-xs text-muted">{item.meta}</p> : null}
        </li>
      ))}
    </ol>
  );
}
