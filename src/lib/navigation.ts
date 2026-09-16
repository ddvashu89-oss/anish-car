import {
  BadgeIndianRupee,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Car,
  FileText,
  Fuel,
  History,
  LayoutDashboard,
  ReceiptIndianRupee,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingDown,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    label: "Operations",
    items: [
      { label: "Bookings", href: "/bookings", icon: CalendarDays, permission: "bookings.view" },
      { label: "Calendar", href: "/calendar", icon: CalendarRange, permission: "bookings.view" },
      { label: "Returns", href: "/returns", icon: RotateCcw, permission: "returns.view" },
      { label: "Customers", href: "/customers", icon: UsersRound, permission: "customers.view" },
      { label: "Fleet", href: "/cars", icon: Car, permission: "cars.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/payments", icon: ReceiptIndianRupee, permission: "payments.view" },
      { label: "Expenses", href: "/expenses", icon: TrendingDown, permission: "expenses.view" },
      { label: "Invoices", href: "/invoices", icon: FileText, permission: "invoices.view" },
    ],
  },
  {
    label: "Fleet care",
    items: [
      { label: "Maintenance", href: "/maintenance", icon: Wrench, permission: "maintenance.view" },
      { label: "Fuel", href: "/fuel", icon: Fuel, permission: "fuel.view" },
      { label: "Documents", href: "/documents", icon: ScrollText, permission: "documents.view" },
    ],
  },
  {
    label: "Insight",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics.view" },
      { label: "Notifications", href: "/notifications", icon: Bell, permission: "notifications.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Staff & Users", href: "/users", icon: Users, permission: "users.view" },
      { label: "Roles & Permissions", href: "/roles", icon: ShieldCheck, permission: "roles.view" },
      { label: "Pricing rules", href: "/pricing", icon: BadgeIndianRupee, permission: "settings.view" },
      { label: "Audit Log", href: "/audit", icon: History, permission: "audit.view" },
      { label: "Settings", href: "/settings", icon: Settings, permission: "settings.view" },
    ],
  },
];

export function visibleNavigation(permissions: Set<string>): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => permissions.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}
