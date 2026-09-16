import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Bell, BellOff, Info, RefreshCw } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, qs } from "@/lib/utils";
import {
  clearOldNotificationsAction,
  markAllReadAction,
  markNotificationReadAction,
  refreshNotificationsAction,
} from "@/lib/actions/notification-actions";
import { ActionButton } from "@/components/form/action-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageFrom } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications · Anish Car Rent" };

const ICON = { INFO: Info, WARNING: AlertTriangle, URGENT: AlertOctagon } as const;
const TONE = {
  INFO: "bg-info-soft text-info",
  WARNING: "bg-warning-soft text-warning",
  URGENT: "bg-danger-soft text-danger",
} as const;

const PAGE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const actor = await requirePermission("notifications.view");
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "unread";
  const page = pageFrom(sp.page);
  const where = tab === "unread" ? { readAt: null } : {};

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { severity: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Returns, pickups, payments, expiring documents and service reminders — checked every 10 minutes."
        actions={
          <>
            <ActionButton action={refreshNotificationsAction} variant="outline" size="md">
              <RefreshCw /> Check now
            </ActionButton>
            {can(actor, "notifications.edit") && unread > 0 ? (
              <ActionButton action={markAllReadAction} variant="secondary" size="md">
                Mark all read
              </ActionButton>
            ) : null}
          </>
        }
      />

      <Tabs
        active={tab}
        items={[
          { key: "unread", label: "Unread", href: "/notifications", count: unread },
          { key: "all", label: "All", href: "/notifications?tab=all" },
        ]}
      />

      <Card className="divide-y divide-line">
        {items.length === 0 ? (
          <EmptyState
            icon={tab === "unread" ? BellOff : Bell}
            title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
            description="New alerts appear here automatically."
          />
        ) : (
          items.map((n) => {
            const Icon = ICON[n.severity];
            return (
              <div key={n.id} className={cn("flex items-start gap-3 p-4", n.readAt && "opacity-60")}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[n.severity])}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className="font-medium hover:text-primary">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  {n.message ? <p className="text-sm text-muted">{n.message}</p> : null}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
                <ActionButton
                  action={markNotificationReadAction}
                  fields={{ notificationId: n.id, read: n.readAt ? "false" : "true" }}
                  className="h-7 shrink-0"
                >
                  {n.readAt ? "Mark unread" : "Mark read"}
                </ActionButton>
              </div>
            );
          })
        )}
      </Card>

      <Pagination page={page} total={total} pageSize={PAGE} hrefFor={(p) => `/notifications${qs({ tab: tab === "all" ? "all" : undefined, page: p })}`} />

      {tab === "all" && can(actor, "notifications.edit") ? (
        <div className="flex justify-end">
          <ActionButton action={clearOldNotificationsAction} confirm="Delete read notifications older than 30 days?">
            Clear read notifications older than 30 days
          </ActionButton>
        </div>
      ) : null}
    </>
  );
}
