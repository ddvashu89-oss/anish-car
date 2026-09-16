import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveDocumentAction } from "@/lib/actions/document-actions";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "../../../document-form";
import { carOptions, customerOptions } from "../../../owners";

export const metadata: Metadata = { title: "Edit document · Anish Car Rent" };

export default async function EditDocumentPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requirePermission("documents.edit");
  const { kind, id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || (kind !== "car" && kind !== "customer")) notFound();

  if (kind === "car") {
    const [doc, owners] = await Promise.all([
      prisma.carDocument.findUnique({ where: { id: docId } }),
      carOptions(),
    ]);
    if (!doc) notFound();
    return (
      <>
        <PageHeader title={`Edit ${doc.documentType}`} />
        <DocumentForm
          action={saveDocumentAction.bind(null, { kind: "car", id: docId })}
          kind="car"
          ownerId={doc.carId}
          owners={owners}
          doc={doc}
          cancelHref={`/cars/${doc.carId}?tab=documents`}
        />
      </>
    );
  }

  const [doc, owners] = await Promise.all([
    prisma.customerDocument.findUnique({ where: { id: docId } }),
    customerOptions(),
  ]);
  if (!doc) notFound();
  return (
    <>
      <PageHeader title={`Edit ${doc.documentType}`} />
      <DocumentForm
        action={saveDocumentAction.bind(null, { kind: "customer", id: docId })}
        kind="customer"
        ownerId={doc.customerId}
        owners={owners}
        doc={doc}
        cancelHref={`/customers/${doc.customerId}?tab=documents`}
      />
    </>
  );
}
