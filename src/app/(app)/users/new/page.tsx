import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createUserAction } from "@/lib/actions/user-actions";
import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Add staff · Anish Car Rent" };

export default async function NewUserPage() {
  await requirePermission("users.create");

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, label: true, description: true },
  });

  return (
    <>
      <PageHeader title="Add staff" description="Create a sign-in for someone on the team." />
      <UserForm action={createUserAction} roles={roles} submitLabel="Create account" />
    </>
  );
}
