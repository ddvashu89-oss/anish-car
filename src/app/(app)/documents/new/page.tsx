import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { saveDocumentAction } from "@/lib/actions/document-actions";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { DocumentForm } from "../document-form";
import { carOptions, customerOptions } from "../owners";

export const metadata: Metadata = { title: "Add document · Anish Car Rent" };

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; carId?: string; customerId?: string }>;
}) {
  await requirePermission("documents.create");
  const sp = await searchParams;
  const kind: "car" | "customer" = sp.customerId || sp.kind === "customer" ? "customer" : "car";
  const ownerId = Number(kind === "car" ? sp.carId : sp.customerId) || undefined;
  const fromOwner = Boolean(ownerId);

  const owners = kind === "car" ? await carOptions() : await customerOptions();
  const cancelHref = ownerId
    ? kind === "car"
      ? `/cars/${ownerId}?tab=documents`
      : `/customers/${ownerId}?tab=documents`
    : "/documents";

  return (
    <>
      <PageHeader title="Add document" description="Expiry dates feed straight into reminders and dashboard alerts." />
      {!fromOwner ? (
        <Tabs
          active={kind}
          items={[
            { key: "car", label: "Car document", href: "/documents/new?kind=car" },
            { key: "customer", label: "Customer document", href: "/documents/new?kind=customer" },
          ]}
        />
      ) : null}
      <DocumentForm
        action={saveDocumentAction.bind(null, null)}
        kind={kind}
        ownerId={ownerId}
        owners={owners}
        cancelHref={cancelHref}
        returnTo={fromOwner ? undefined : "documents"}
      />
    </>
  );
}
