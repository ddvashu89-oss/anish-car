import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateUserAction } from "@/lib/actions/user-actions";
import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Edit staff · Anish Car Rent" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("users.edit");

  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) notFound();

  const [user, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, label: true, description: true },
    }),
  ]);

  if (!user) notFound();

  return (
    <>
      <PageHeader title={user.name} description={`${user.staffCode} · ${user.email}`} />
      <UserForm
        action={updateUserAction.bind(null, userId)}
        roles={roles}
        submitLabel="Save changes"
        isEdit
        defaults={{
          name: user.name,
          email: user.email,
          mobile: user.mobile ?? "",
          roleId: user.roleId,
          status: user.status,
          joiningDate: user.joiningDate ? user.joiningDate.toISOString().slice(0, 10) : "",
        }}
      />
    </>
  );
}
