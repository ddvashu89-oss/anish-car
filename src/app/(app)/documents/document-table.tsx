import Link from "next/link";
import { FileText, Paperclip } from "lucide-react";

import { deleteDocumentAction } from "@/lib/actions/document-actions";
import { todayDateOnly } from "@/lib/dates";
import { daysLeftLabel, DOC_STATE_META, documentState } from "@/lib/documents";
import { fileUrl } from "@/lib/uploads";
import { formatDate } from "@/lib/utils";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";

export type DocumentRow = {
  id: number;
  kind: "car" | "customer";
  documentType: string;
  documentNumber: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  fileUrl: string | null;
  notes: string | null;
  owner?: { label: string; sub?: string; href: string };
};

export function DocumentTable({
  rows,
  windowFor,
  canEdit,
  canDelete,
  emptyText,
}: {
  rows: DocumentRow[];
  windowFor: (documentType: string) => number;
  canEdit: boolean;
  canDelete: boolean;
  emptyText: string;
}) {
  const today = todayDateOnly();
  const showOwner = rows.some((r) => r.owner);

  if (rows.length === 0) {
    return (
      <TableWrap>
        <EmptyState icon={FileText} title="No documents" description={emptyText} />
      </TableWrap>
    );
  }

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Document</Th>
            {showOwner ? <Th>Belongs to</Th> : null}
            <Th>Issued</Th>
            <Th>Expires</Th>
            <Th>Status</Th>
            <Th>File</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { state, daysLeft } = documentState(row.expiryDate, today, windowFor(row.documentType));
            const meta = DOC_STATE_META[state];
            return (
              <tr key={`${row.kind}-${row.id}`} className="hover:bg-surface-2/60">
                <Td>
                  <span className="block font-medium">{row.documentType}</span>
                  <span className="block font-mono text-[11px] text-muted">{row.documentNumber ?? "—"}</span>
                  {row.notes ? <span className="block text-[11px] text-muted">{row.notes}</span> : null}
                </Td>
                {showOwner ? (
                  <Td>
                    {row.owner ? (
                      <Link href={row.owner.href} className="hover:text-primary">
                        {row.owner.label}
                        {row.owner.sub ? (
                          <span className="block font-mono text-[11px] text-muted">{row.owner.sub}</span>
                        ) : null}
                      </Link>
                    ) : null}
                  </Td>
                ) : null}
                <Td className="text-xs">{formatDate(row.issueDate)}</Td>
                <Td className="text-xs">
                  {formatDate(row.expiryDate)}
                  {row.expiryDate ? <span className="block text-[11px] text-muted">{daysLeftLabel(daysLeft)}</span> : null}
                </Td>
                <Td>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </Td>
                <Td>
                  {row.fileUrl ? (
                    <a
                      href={fileUrl(row.fileUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Paperclip className="size-3.5" /> View
                    </a>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    {canEdit ? (
                      <Link
                        href={`/documents/${row.kind}/${row.id}/edit`}
                        className="px-2 text-xs font-medium text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
                    {canDelete ? (
                      <ActionButton
                        action={deleteDocumentAction}
                        fields={{ kind: row.kind, documentId: row.id }}
                        confirm={`Delete ${row.documentType}${row.documentNumber ? ` ${row.documentNumber}` : ""}?`}
                        className="h-7 text-danger"
                      >
                        Delete
                      </ActionButton>
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
