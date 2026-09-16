import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allPermissionKeys } from "@/lib/permissions";
import { deleteRoleAction } from "@/lib/actions/role-actions";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NewRoleForm } from "./new-role-form";

export const metadata: Metadata = { title: "Roles & Permissions · Anish Car Rent" };

export default async function RolesPage() {
  const actor = await requirePermission("roles.view");
  const canEdit = can(actor, "roles.edit");
  const totalPermissions = allPermissionKeys().length;

  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    include: { _count: { select: { users: true, permissions: true } } },
  });

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Permissions are enforced on the server, so a hidden menu item is also a blocked request."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <span className="font-medium">{role.label}</span>
                    {role.isSystem ? <Badge tone="primary">built-in</Badge> : null}
                  </div>
                  {role.description ? (
                    <p className="mt-1 text-xs text-muted">{role.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">
                    {role.name === "admin"
                      ? `All ${totalPermissions} permissions`
                      : `${role._count.permissions} of ${totalPermissions} permissions`}
                    {" · "}
                    {role._count.users} {role._count.users === 1 ? "person" : "people"}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <Link href={`/roles/${role.id}`} className="font-medium text-primary hover:underline">
                    {canEdit ? "Edit permissions" : "View permissions"}
                  </Link>
                  {canEdit && !role.isSystem && role._count.users === 0 ? (
                    <ActionButton
                      action={deleteRoleAction}
                      fields={{ roleId: role.id }}
                      confirm={`Delete the ${role.label} role?`}
                      className="h-7 text-danger"
                    >
                      Delete
                    </ActionButton>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {canEdit ? <NewRoleForm /> : null}
      </div>
    </>
  );
}
