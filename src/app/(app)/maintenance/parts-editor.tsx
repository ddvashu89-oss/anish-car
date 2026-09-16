"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { formatMoney, round2 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

type Row = { key: number; name: string; qty: string; cost: string };

/** Parts rows plus labour, with a running total. Rows submit as parallel partName/partQty/partCost arrays. */
export function PartsEditor() {
  const [rows, setRows] = useState<Row[]>([{ key: 1, name: "", qty: "1", cost: "" }]);
  const [labour, setLabour] = useState("");
  const [nextKey, setNextKey] = useState(2);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const partsTotal = round2(
    rows.reduce((s, r) => s + (r.name.trim() ? (Number(r.qty) || 1) * (Number(r.cost) || 0) : 0), 0),
  );
  const total = round2(partsTotal + (Number(labour) || 0));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1fr_5rem_7rem_2rem] gap-2 sm:grid">
        <Label>Part</Label>
        <Label>Qty</Label>
        <Label>Cost each (₹)</Label>
        <span />
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_4rem_6rem_2rem] gap-2 sm:grid-cols-[1fr_5rem_7rem_2rem]">
          <Input name="partName" placeholder="Engine oil" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
          <Input name="partQty" type="number" min="0" step="0.01" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
          <Input name="partCost" type="number" min="0" step="0.01" value={r.cost} onChange={(e) => update(r.key, { cost: e.target.value })} />
          <button
            type="button"
            aria-label="Remove part"
            onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [{ key: r.key, name: "", qty: "1", cost: "" }]))}
            className="grid place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, name: "", qty: "1", cost: "" }]);
          setNextKey((k) => k + 1);
        }}
      >
        <Plus /> Add part
      </Button>

      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="labourCost">Labour (₹)</Label>
          <Input id="labourCost" name="labourCost" type="number" min="0" step="0.01" value={labour} onChange={(e) => setLabour(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Parts</Label>
          <p className="h-10 content-center text-sm tabular-nums">{formatMoney(partsTotal)}</p>
        </div>
        <div className="space-y-1.5">
          <Label>Total</Label>
          <p className="h-10 content-center text-lg font-semibold tabular-nums">{formatMoney(total)}</p>
        </div>
      </div>
    </div>
  );
}
