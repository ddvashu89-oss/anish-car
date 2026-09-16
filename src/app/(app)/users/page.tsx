import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { deleteUserAction } from "@/lib/actions/user-actions";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Staff & Users · Anish Car Rent" };

const STATUS_TONE = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
} as const;

export default async function UsersPage() {
  const actor = await requirePermission("users.view");

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { role: { select: { label: true } } },
  });

  const canCreate = can(actor, "users.create");
  const canEdit = can(actor, "users.edit");
  const canDelete = can(actor, "users.delete");

  return (
    <>
      <PageHeader
        title="Staff & Users"
        description="Who can sign in, and what role they hold."
        actions={
          canCreate ? (
            <Link
              href="/users/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              <Plus className="size-4" />
              Add staff
            </Link>
          ) : null
        }
      />

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Staff</Th>
              <Th>Code</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <EmptyRow colSpan={6}>No staff accounts yet.</EmptyRow>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-2/60">
                  <Td>
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-muted">{user.email}</span>
                  </Td>
                  <Td className="font-mono text-xs text-muted">{user.staffCode}</Td>
                  <Td>{user.role.label}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[user.status]}>{user.status.toLowerCase()}</Badge>
                  </Td>
                  <Td className="text-xs text-muted">{formatDateTime(user.lastLoginAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3 text-xs">
                      {canEdit ? (
                        <Link href={`/users/${user.id}`} className="font-medium text-primary hover:underline">
                          Edit
                        </Link>
                      ) : null}
                      {canDelete && user.id !== actor.id ? (
                        <ActionButton
                          action={deleteUserAction}
                          fields={{ userId: user.id }}
                          confirm={`Remove ${user.name}? They will no longer be able to sign in.`}
                          className="h-7 text-danger"
                        >
                          Delete
                        </ActionButton>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
