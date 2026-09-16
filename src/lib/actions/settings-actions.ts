"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fail, ok, type FormState } from "@/lib/actions/types";

const PREFIX = "setting:";

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.edit");

  const submitted = new Map<string, string>();
  for (const [field, value] of formData.entries()) {
    if (field.startsWith(PREFIX)) submitted.set(field.slice(PREFIX.length), String(value));
  }
  if (submitted.size === 0) return fail(null, "Nothing to save.");

  const existing = await prisma.setting.findMany({
    where: { key: { in: [...submitted.keys()] } },
  });

  const changed = existing.filter((row) => submitted.get(row.key) !== row.value);
  if (changed.length === 0) return ok("No changes to save.");

  for (const row of changed) {
    const value = submitted.get(row.key)!;
    if (row.valueType === "number" && value !== "" && Number.isNaN(Number(value))) {
      return fail(formData, `${row.label ?? row.key} must be a number.`, { [`${PREFIX}${row.key}`]: "Numbers only" });
    }
  }

  await prisma.$transaction(
    changed.map((row) =>
      prisma.setting.update({ where: { key: row.key }, data: { value: submitted.get(row.key)! } }),
    ),
  );

  await recordAudit({
    userId: actor.id,
    action: "settings.update",
    entity: "Setting",
    summary: `Updated ${changed.length} setting${changed.length === 1 ? "" : "s"}`,
    oldValue: Object.fromEntries(changed.map((row) => [row.key, row.value])),
    newValue: Object.fromEntries(changed.map((row) => [row.key, submitted.get(row.key)])),
  });

  revalidatePath("/settings");
  return ok(`Saved ${changed.length} change${changed.length === 1 ? "" : "s"}.`);
}
