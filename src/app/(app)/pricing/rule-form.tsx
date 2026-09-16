"use client";

import { useState } from "react";

import { createRateRuleAction } from "@/lib/actions/pricing-actions";
import { ActionForm, FInput, FormField, FSelect, SubmitButton } from "@/components/form/action-form";
import { Select } from "@/components/ui/field";

const KINDS = [
  { value: "DURATION_SLAB", label: "Length of rental", help: "e.g. 4–7 days at ₹1,800/day" },
  { value: "WEEKEND", label: "Weekend rate", help: "Applies to Saturdays and Sundays" },
  { value: "SEASONAL", label: "Season", help: "A date range, e.g. summer holidays" },
  { value: "HOLIDAY", label: "Holiday / festival", help: "Specific dates, e.g. Diwali" },
];

export function RuleForm({ cars }: { cars: Array<{ value: number; label: string }> }) {
  const [kind, setKind] = useState("DURATION_SLAB");
  const help = KINDS.find((k) => k.value === kind)?.help;

  return (
    <ActionForm action={createRateRuleAction}>
      <FormField label="Rule type" name="kind" hint={help}>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Name" name="label" required>
        <FInput name="label" placeholder={kind === "DURATION_SLAB" ? "Weekly discount" : kind === "WEEKEND" ? "Weekend" : "Diwali 2026"} />
      </FormField>
      <FormField label="Applies to" name="carId">
        <FSelect name="carId" placeholder="All cars" options={cars} />
      </FormField>
      {kind === "DURATION_SLAB" ? (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="From (days)" name="minDays">
            <FInput name="minDays" type="number" min="1" />
          </FormField>
          <FormField label="To (days)" name="maxDays" hint="Blank = no limit">
            <FInput name="maxDays" type="number" min="1" />
          </FormField>
        </div>
      ) : null}
      {kind === "SEASONAL" || kind === "HOLIDAY" ? (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start date" name="startDate" required>
            <FInput name="startDate" type="date" />
          </FormField>
          <FormField label="End date" name="endDate" required>
            <FInput name="endDate" type="date" />
          </FormField>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Daily rate (₹)" name="dailyRate" required>
          <FInput name="dailyRate" type="number" step="0.01" min="0" />
        </FormField>
        <FormField label="Priority" name="priority" hint="Higher wins on overlap">
          <FInput name="priority" type="number" min="0" max="100" defaultValue={0} />
        </FormField>
      </div>
      <SubmitButton className="w-full">Add rule</SubmitButton>
    </ActionForm>
  );
}
