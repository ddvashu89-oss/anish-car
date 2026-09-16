import Link from "next/link";

/**
 * Ranked horizontal bars in plain HTML — one hue, value labels always visible,
 * native title tooltips. Used where a legend would add nothing.
 */
export function BarList({
  items,
  color = "var(--series-1)",
  max,
  empty = "Nothing to show.",
}: {
  items: Array<{ key: string | number; label: string; sub?: string; value: number; display: string; href?: string }>;
  color?: string;
  max?: number;
  empty?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 0);

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const pct = top > 0 ? Math.max(0, Math.min(100, (item.value / top) * 100)) : 0;
        const label = (
          <span className="min-w-0 truncate">
            {item.label}
            {item.sub ? <span className="ml-1.5 font-mono text-[10px] text-muted">{item.sub}</span> : null}
          </span>
        );
        return (
          <li key={item.key} title={`${item.label}: ${item.display}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              {item.href ? (
                <Link href={item.href} className="min-w-0 hover:text-primary">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="shrink-0 tabular-nums">{item.display}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? 4 : 0 }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
