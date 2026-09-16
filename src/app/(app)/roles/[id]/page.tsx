import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateRoleAction } from "@/lib/actions/role-actions";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionMatrix } from "./permission-matrix";

export const metadata: Metadata = { title: "Role permissions · Anish Car Rent" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("roles.view");

  const roleId = Number((await params).id);
  if (!Number.isInteger(roleId)) notFound();

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: { select: { key: true } } } } },
  });

  if (!role) notFound();

  return (
    <>
      <PageHeader
        title={role.label}
        description="Tick what this role can do. Unticked actions are refused by the server, not just hidden."
      />
      <PermissionMatrix
        action={updateRoleAction.bind(null, roleId)}
        role={{ name: role.name, label: role.label, description: role.description }}
        granted={role.permissions.map((rp) => rp.permission.key)}
        readOnly={!can(actor, "roles.edit")}
      />
    </>
  );
}
