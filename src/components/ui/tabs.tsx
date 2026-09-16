import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: string; href: string; count?: number };

/** URL-driven tabs, so every tab is linkable and works without client JS. */
export function Tabs({ items, active, className }: { items: TabItem[]; active: string; className?: string }) {
  return (
    <nav className={cn("-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1", className)}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  isActive ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
