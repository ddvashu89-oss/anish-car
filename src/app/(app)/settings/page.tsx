import type { Metadata } from "next";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsForm, type SettingRow } from "./settings-form";

export const metadata: Metadata = { title: "Settings · Anish Car Rent" };

const GROUP_ORDER = ["company", "billing", "reminders"];

export default async function SettingsPage() {
  const actor = await requirePermission("settings.view");

  const settings = await prisma.setting.findMany({
    where: { group: { not: "system" } },
    orderBy: { key: "asc" },
  });

  const groups: Record<string, SettingRow[]> = {};
  for (const setting of settings) {
    (groups[setting.group] ??= []).push(setting);
  }

  const ordered = Object.fromEntries(
    Object.entries(groups).sort(
      ([a], [b]) =>
        (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
    ),
  );

  return (
    <>
      <PageHeader title="Settings" description="Business details and the rules the system applies for you." />
      <SettingsForm groups={ordered} readOnly={!can(actor, "settings.edit")} />
    </>
  );
}
