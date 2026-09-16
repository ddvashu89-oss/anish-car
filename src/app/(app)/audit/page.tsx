import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Audit Log · Anish Car Rent" };

const PAGE_SIZE = 50;

function toneFor(action: string) {
  if (action.endsWith(".delete")) return "danger" as const;
  if (action.endsWith(".create")) return "success" as const;
  if (action.startsWith("auth.")) return "info" as const;
  return "neutral" as const;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("audit.view");

  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, staffCode: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`${total} recorded ${total === 1 ? "action" : "actions"}. Who did what, and when.`}
      />

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Details</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <EmptyRow colSpan={5}>Nothing recorded yet.</EmptyRow>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-2/60">
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(entry.createdAt)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-sm">{entry.user?.name ?? "System"}</span>
                    {entry.user?.staffCode ? (
                      <span className="block font-mono text-[11px] text-muted">
                        {entry.user.staffCode}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                  </Td>
                  <Td className="text-sm">{entry.summary ?? entry.entity}</Td>
                  <Td className="font-mono text-xs text-muted">{entry.ipAddress ?? "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <a
                href={`/audit?page=${page - 1}`}
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2"
              >
                Previous
              </a>
            ) : null}
            {page < totalPages ? (
              <a
                href={`/audit?page=${page + 1}`}
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2"
              >
                Next
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
