"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney, formatMoneyCompact } from "@/lib/utils";

export type CashPoint = { label: string; collections: number; expenses: number; profit: number };

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: color }} />;
}

function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} /> {i.label}
        </span>
      ))}
    </div>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string; strong?: boolean }> }) {
  return (
    <div className="card-shadow min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
      <p className="mb-1.5 font-semibold text-fg">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className={`flex items-center justify-between gap-4 py-0.5 ${r.strong ? "mt-1 border-t border-line pt-1.5 font-semibold text-fg" : "text-muted"}`}>
          <span className="flex items-center gap-1.5">
            {r.color ? <Swatch color={r.color} /> : null}
            {r.label}
          </span>
          <span className="text-fg tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Money in vs money out per month. Profit lives in the tooltip, not on a second axis. */
export function CashflowChart({ data, height = 280 }: { data: CashPoint[]; height?: number }) {
  const empty = data.every((d) => d.collections === 0 && d.expenses === 0);
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: "Collections", color: "var(--series-1)" },
          { label: "Expenses", color: "var(--series-2)" },
        ]}
      />
      <div style={{ height }} className="relative">
        {empty ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">No money in or out yet.</p>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={56} tickFormatter={(v: number) => formatMoneyCompact(v)} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CashPoint;
                return (
                  <TooltipBox
                    title={p.label}
                    rows={[
                      { label: "Collections", value: formatMoney(p.collections), color: "var(--series-1)" },
                      { label: "Expenses", value: formatMoney(p.expenses), color: "var(--series-2)" },
                      { label: p.profit >= 0 ? "Profit" : "Loss", value: formatMoney(p.profit), strong: true },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="collections" name="Collections" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expenses" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A single-series count over time. */
export function TrendChart({
  data,
  dataKey,
  label,
  height = 200,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  label: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[{ label, value: String(payload[0].value), color: "var(--series-1)" }]}
                />
              ) : null
            }
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
