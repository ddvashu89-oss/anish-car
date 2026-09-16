"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Plus, Search, X } from "lucide-react";

import { logoutAction } from "@/lib/actions/auth-actions";
import { visibleNavigation } from "@/lib/navigation";
import { cn, initials } from "@/lib/utils";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export type ShellUser = {
  name: string;
  email: string;
  staffCode: string;
  roleLabel: string;
  permissions: string[];
};

export function AppShell({
  user,
  unread,
  companyName,
  children,
}: {
  user: ShellUser;
  unread: number;
  companyName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const permissions = new Set(user.permissions);
  const groups = visibleNavigation(permissions);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{group.label}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/notifications" && unread > 0 ? (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white tabular-nums">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
        {companyName.charAt(0).toUpperCase() || "A"}
      </span>
      <span className="text-sm leading-tight font-semibold">
        {companyName}
        <span className="block text-[11px] font-normal text-muted">Command centre</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen print:block">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {brand}
        {nav}
      </aside>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-surface">
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-4 z-10 text-muted"
            >
              <X className="size-5" />
            </button>
            {brand}
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6">
          <button aria-label="Open menu" className="text-muted hover:text-fg lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>

          <form action="/search" method="get" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              type="search"
              placeholder="Search customer, mobile, car no., booking, invoice…"
              className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm placeholder:text-muted/70 focus:border-primary"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            {permissions.has("bookings.create") ? (
              <Link
                href="/bookings/new"
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover md:inline-flex"
              >
                <Plus className="size-4" /> Booking
              </Link>
            ) : null}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            {permissions.has("notifications.view") ? (
              <Link
                href="/notifications"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Bell className="size-4" />
                {unread > 0 ? (
                  <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <div className="hidden items-center gap-2.5 border-l border-line pl-3 lg:flex">
              <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {initials(user.name)}
              </span>
              <span className="text-xs leading-tight">
                <span className="block font-medium">{user.name}</span>
                <span className="block text-muted">{user.roleLabel}</span>
              </span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 sm:p-6 print:space-y-4 print:p-0">{children}</main>
      </div>
    </div>
  );
}
