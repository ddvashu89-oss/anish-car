"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { syncNotifications } from "@/lib/notifications";
import { ok, type FormState } from "@/lib/actions/types";

export async function markNotificationReadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("notifications.view");
  const id = Number(formData.get("notificationId"));
  const read = formData.get("read") !== "false";
  await prisma.notification.updateMany({ where: { id }, data: { readAt: read ? new Date() : null } });
  revalidatePath("/notifications");
  return ok(read ? "Marked as read." : "Marked as unread.");
}

export async function markAllReadAction(): Promise<FormState> {
  await requirePermission("notifications.edit");
  const { count } = await prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return ok(`${count} notification${count === 1 ? "" : "s"} cleared.`);
}

export async function refreshNotificationsAction(): Promise<FormState> {
  await requirePermission("notifications.view");
  await syncNotifications({ force: true });
  revalidatePath("/notifications");
  return ok("Checked for new alerts.");
}

export async function clearOldNotificationsAction(): Promise<FormState> {
  await requirePermission("notifications.edit");
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({ where: { readAt: { not: null, lt: cutoff } } });
  revalidatePath("/notifications");
  return ok(`Removed ${count} old notification${count === 1 ? "" : "s"}.`);
}
