"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword, requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextEntityCode } from "@/lib/sequence";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";

const baseSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  mobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter a 10-digit mobile number")
    .optional()
    .or(z.literal("")),
  roleId: z.coerce.number().int().positive("Choose a role"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  joiningDate: z.string().optional().or(z.literal("")),
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const createSchema = baseSchema.extend({ password: passwordSchema });
const updateSchema = baseSchema.extend({
  password: z.union([passwordSchema, z.literal("")]).optional(),
});

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    email: formData.get("email"),
    mobile: formData.get("mobile"),
    roleId: formData.get("roleId"),
    status: formData.get("status"),
    joiningDate: formData.get("joiningDate"),
    password: formData.get("password"),
  };
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("users.create");
  const parsed = createSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return invalid(formData, parsed.error.issues);
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return fail(formData, "That email is already in use.", { email: "Already registered" });
  }

  const created = await prisma.user.create({
    data: {
      staffCode: await nextEntityCode("STF"),
      name: data.name,
      email: data.email,
      mobile: data.mobile || null,
      roleId: data.roleId,
      status: data.status,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : null,
      passwordHash: await hashPassword(data.password),
    },
    include: { role: true },
  });

  await recordAudit({
    userId: actor.id,
    action: "user.create",
    entity: "User",
    entityId: created.id,
    summary: `Added ${created.name} as ${created.role.label}`,
    newValue: { name: created.name, email: created.email, role: created.role.name },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUserAction(
  userId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("users.edit");
  const parsed = updateSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return invalid(formData, parsed.error.issues);
  }

  const data = parsed.data;
  const before = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!before) return fail(null, "That user no longer exists.");

  const emailOwner = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailOwner && emailOwner.id !== userId) {
    return fail(formData, "That email is already in use.", { email: "Already registered" });
  }

  // Locking yourself out is the one mistake this screen must not allow.
  if (actor.id === userId && data.status !== "ACTIVE") {
    return fail(formData, "You cannot deactivate your own account.");
  }

  if (before.role.name === "admin" && (data.roleId !== before.roleId || data.status !== "ACTIVE")) {
    const activeAdmins = await prisma.user.count({
      where: { role: { name: "admin" }, status: "ACTIVE" },
    });
    if (activeAdmins <= 1) {
      return fail(formData, "This is the last active admin — keep at least one.");
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      email: data.email,
      mobile: data.mobile || null,
      roleId: data.roleId,
      status: data.status,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : null,
      ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
    },
    include: { role: true },
  });

  // A password change or deactivation should end any session already open elsewhere.
  if (data.password || updated.status !== "ACTIVE") {
    await prisma.session.deleteMany({ where: { userId } });
  }

  await recordAudit({
    userId: actor.id,
    action: "user.update",
    entity: "User",
    entityId: userId,
    summary: `Updated ${updated.name}${data.password ? " (password reset)" : ""}`,
    oldValue: { name: before.name, email: before.email, role: before.role.name, status: before.status },
    newValue: { name: updated.name, email: updated.email, role: updated.role.name, status: updated.status },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function deleteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("users.delete");
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return fail(null, "Unknown user.");

  if (actor.id === userId) return fail(null, "You cannot delete your own account.");

  const target = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) return fail(null, "Already deleted.");

  if (target.role.name === "admin") {
    const activeAdmins = await prisma.user.count({
      where: { role: { name: "admin" }, status: "ACTIVE" },
    });
    if (activeAdmins <= 1) return fail(null, "This is the last active admin — keep at least one.");
  }

  const history = await prisma.booking.count({ where: { createdById: userId } });
  if (history > 0) {
    return fail(null, "This person has bookings on record. Set their status to Inactive instead so the history keeps their name.");
  }
  await prisma.user.delete({ where: { id: userId } });

  await recordAudit({
    userId: actor.id,
    action: "user.delete",
    entity: "User",
    entityId: userId,
    summary: `Removed ${target.name}`,
    oldValue: { name: target.name, email: target.email, role: target.role.name },
  });

  revalidatePath("/users");
  return ok("User removed.");
}
