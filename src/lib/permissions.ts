/**
 * The permission catalogue. Seeding reads this, so adding a module here and re-running
 * `npm run db:seed` is all it takes to expose new permissions in the roles screen.
 */

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  export: "Export",
};

export type ModuleDef = {
  key: string;
  label: string;
  actions: readonly Action[];
};

export const MODULES: readonly ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "customers", label: "Customers", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "cars", label: "Fleet", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "bookings", label: "Bookings", actions: ["view", "create", "edit", "delete", "approve"] },
  { key: "returns", label: "Returns & Handover", actions: ["view", "create", "edit"] },
  { key: "payments", label: "Payments", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "expenses", label: "Expenses", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "invoices", label: "Invoices", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "maintenance", label: "Maintenance", actions: ["view", "create", "edit", "delete"] },
  { key: "fuel", label: "Fuel", actions: ["view", "create", "edit", "delete"] },
  { key: "documents", label: "Documents", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Reports", actions: ["view", "export"] },
  { key: "analytics", label: "Analytics", actions: ["view"] },
  { key: "notifications", label: "Notifications", actions: ["view", "edit"] },
  { key: "users", label: "Staff & Users", actions: ["view", "create", "edit", "delete"] },
  { key: "roles", label: "Roles & Permissions", actions: ["view", "edit"] },
  { key: "settings", label: "Settings", actions: ["view", "edit"] },
  { key: "audit", label: "Audit Log", actions: ["view", "export"] },
];

export function allPermissionKeys(): string[] {
  return MODULES.flatMap((m) => m.actions.map((a) => `${m.key}.${a}`));
}

export function permissionLabel(moduleKey: string, action: Action) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  return `${ACTION_LABELS[action]} ${mod?.label ?? moduleKey}`;
}

/** Permissions granted to the built-in Staff role. Admin always gets everything. */
export const STAFF_PERMISSIONS: string[] = [
  "dashboard.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "cars.view",
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "returns.view",
  "returns.create",
  "returns.edit",
  "payments.view",
  "payments.create",
  "invoices.view",
  "invoices.create",
  "maintenance.view",
  "fuel.view",
  "fuel.create",
  "documents.view",
  "documents.create",
  "notifications.view",
  "reports.view",
];
