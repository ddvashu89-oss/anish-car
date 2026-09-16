"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";

const roleSchema = z.object({
  label: z.string().trim().min(2, "Name is required"),
  description: z.string().trim().max(255).optional().or(z.literal("")),
});

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function createRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("roles.edit");
  const parsed = roleSchema.safeParse({
    label: formData.get("label"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return invalid(formData, parsed.error.issues);
  }

  const name = slugify(parsed.data.label);
  if (!name) return fail(formData, "Use letters or numbers in the role name.", { label: "Invalid name" });

  const existing = await prisma.role.findUnique({ where: { name } });
  if (existing) return fail(formData, "A role with that name already exists.", { label: "Already used" });

  const role = await prisma.role.create({
    data: { name, label: parsed.data.label, description: parsed.data.description || null },
  });

  await recordAudit({
    userId: actor.id,
    action: "role.create",
    entity: "Role",
    entityId: role.id,
    summary: `Created role ${role.label}`,
  });

  revalidatePath("/roles");
  redirect(`/roles/${role.id}`);
}

export async function updateRoleAction(
  roleId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("roles.edit");

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { select: { permissionId: true } } },
  });
  if (!role) return fail(null, "That role no longer exists.");

  const parsed = roleSchema.safeParse({
    label: formData.get("label"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return invalid(formData, parsed.error.issues);
  }

  const selectedKeys = formData.getAll("permissions").map(String);
  const selected = await prisma.permission.findMany({
    where: { key: { in: selectedKeys } },
    select: { id: true, key: true },
  });

  // Admin is the escape hatch that keeps the system administrable; it keeps everything.
  const isAdmin = role.name === "admin";
  if (!isAdmin && selected.length === 0) {
    return fail(null, "Give the role at least one permission.");
  }

  const before = new Set(role.permissions.map((p) => p.permissionId));
  const after = new Set(selected.map((p) => p.id));

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: roleId },
      data: { label: parsed.data.label, description: parsed.data.description || null },
    });

    if (isAdmin) return;

    const toRemove = [...before].filter((id) => !after.has(id));
    const toAdd = [...after].filter((id) => !before.has(id));

    if (toRemove.length > 0) {
      await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { in: toRemove } } });
    }
    if (toAdd.length > 0) {
      await tx.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }
  });

  await recordAudit({
    userId: actor.id,
    action: "role.update",
    entity: "Role",
    entityId: roleId,
    summary: `Updated permissions for ${parsed.data.label}`,
    oldValue: { permissionCount: before.size },
    newValue: { permissionCount: isAdmin ? before.size : after.size },
  });

  revalidatePath("/roles");
  revalidatePath(`/roles/${roleId}`);
  return ok("Saved.");
}

export async function deleteRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("roles.edit");
  const roleId = Number(formData.get("roleId"));
  if (!Number.isInteger(roleId)) return fail(null, "Unknown role.");

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return fail(null, "Already deleted.");

  if (role.isSystem) return fail(null, "Built-in roles cannot be deleted.");
  if (role._count.users > 0) return fail(null, "Move the staff on this role to another role first.");

  await prisma.role.delete({ where: { id: roleId } });

  await recordAudit({
    userId: actor.id,
    action: "role.delete",
    entity: "Role",
    entityId: roleId,
    summary: `Deleted role ${role.label}`,
  });

  revalidatePath("/roles");
  return ok("Role deleted.");
}
