import { can, requireUser } from "@/lib/auth";
import { syncNotifications, unreadCount } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const canSeeAlerts = can(user, "notifications.view");
  if (canSeeAlerts) {
    // Throttled internally; a failure here should never take the whole app down.
    await syncNotifications().catch((error) => console.error("[notifications] sync failed", error));
  }
  const [unread, settings] = await Promise.all([canSeeAlerts ? unreadCount() : 0, getSettings()]);

  return (
    <AppShell
      unread={unread}
      companyName={settings.company.name}
      user={{
        name: user.name,
        email: user.email,
        staffCode: user.staffCode,
        roleLabel: user.roleLabel,
        permissions: [...user.permissions],
      }}
    >
      {children}
    </AppShell>
  );
}
