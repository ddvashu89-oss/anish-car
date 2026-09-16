"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/utils";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { optionalDateOnly, optionalId, optionalInt, requiredMoney, requiredText } from "@/lib/validation";

const schema = z
  .object({
    kind: z.enum(["DURATION_SLAB", "WEEKEND", "SEASONAL", "HOLIDAY"]),
    label: requiredText("Name", 120),
    carId: optionalId,
    minDays: optionalInt,
    maxDays: optionalInt,
    startDate: optionalDateOnly,
    endDate: optionalDateOnly,
    dailyRate: requiredMoney("Daily rate"),
    priority: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().int().min(0).max(100)),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "DURATION_SLAB") {
      if (d.minDays === undefined && d.maxDays === undefined) {
        ctx.addIssue({ code: "custom", path: ["minDays"], message: "Set a minimum or maximum number of days" });
      }
      if (d.minDays !== undefined && d.maxDays !== undefined && d.maxDays < d.minDays) {
        ctx.addIssue({ code: "custom", path: ["maxDays"], message: "Must be at least the minimum" });
      }
    }
    if (d.kind === "SEASONAL" || d.kind === "HOLIDAY") {
      if (!d.startDate) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is required" });
      if (!d.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is required" });
      if (d.startDate && d.endDate && d.endDate < d.startDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "Must be on or after the start date" });
      }
    }
  });

export async function createRateRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.edit");
  const keys = ["kind", "label", "carId", "minDays", "maxDays", "startDate", "endDate", "dailyRate", "priority"];
  const parsed = schema.safeParse(Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return invalid(formData, parsed.error.issues);
  const d = parsed.data;

  const dated = d.kind === "SEASONAL" || d.kind === "HOLIDAY";
  const rule = await prisma.rateRule.create({
    data: {
      kind: d.kind,
      label: d.label,
      carId: d.carId ?? null,
      minDays: d.kind === "DURATION_SLAB" ? (d.minDays ?? null) : null,
      maxDays: d.kind === "DURATION_SLAB" ? (d.maxDays ?? null) : null,
      startDate: dated ? d.startDate! : null,
      endDate: dated ? d.endDate! : null,
      dailyRate: d.dailyRate,
      priority: d.priority,
    },
  });

  await recordAudit({
    userId: actor.id,
    action: "pricing.create",
    entity: "RateRule",
    entityId: rule.id,
    summary: `Added pricing rule "${d.label}" at ${formatMoney(d.dailyRate)}/day`,
  });
  revalidatePath("/pricing");
  return ok("Rule added. New bookings use it straight away.");
}

export async function toggleRateRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.edit");
  const ruleId = Number(formData.get("ruleId"));
  const rule = await prisma.rateRule.findUnique({ where: { id: ruleId } });
  if (!rule) return fail(null, "This rule no longer exists.");
  await prisma.rateRule.update({ where: { id: ruleId }, data: { isActive: !rule.isActive } });
  await recordAudit({
    userId: actor.id,
    action: "pricing.toggle",
    entity: "RateRule",
    entityId: ruleId,
    summary: `${rule.isActive ? "Paused" : "Enabled"} pricing rule "${rule.label}"`,
  });
  revalidatePath("/pricing");
  return ok(rule.isActive ? "Rule paused." : "Rule enabled.");
}

export async function deleteRateRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.edit");
  const ruleId = Number(formData.get("ruleId"));
  const rule = await prisma.rateRule.findUnique({ where: { id: ruleId } });
  if (!rule) return fail(null, "Already deleted.");
  await prisma.rateRule.delete({ where: { id: ruleId } });
  await recordAudit({
    userId: actor.id,
    action: "pricing.delete",
    entity: "RateRule",
    entityId: ruleId,
    summary: `Deleted pricing rule "${rule.label}"`,
  });
  revalidatePath("/pricing");
  return ok("Rule deleted. Existing bookings keep the price they were booked at.");
}
