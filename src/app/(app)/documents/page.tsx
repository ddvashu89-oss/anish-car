import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, todayDateOnly } from "@/lib/dates";
import {
  CAR_DOCUMENT_TYPES,
  CUSTOMER_DOCUMENT_TYPES,
  daysLeftLabel,
  DOC_STATE_META,
  documentState,
  type DocState,
} from "@/lib/documents";
import { getSettings, reminderDaysFor } from "@/lib/settings";
import { formatDate, qs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { DocumentTable, type DocumentRow } from "./document-table";

export const metadata: Metadata = { title: "Documents · Anish Car Rent" };

type Search = { tab?: string; q?: string; type?: string; state?: string };

const ATTENTION: DocState[] = ["EXPIRED", "URGENT", "EXPIRING_SOON"];
const ORDER: Record<DocState, number> = { EXPIRED: 0, URGENT: 1, EXPIRING_SOON: 2, VALID: 3, NA: 4 };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePermission("documents.view");
  const sp = await searchParams;
  const tab = ["attention", "car", "customer"].includes(sp.tab ?? "") ? sp.tab! : "attention";
  const q = sp.q?.trim().toLowerCase() ?? "";
  const settings = await getSettings();
  const today = todayDateOnly();
  const windowFor = (type: string) => reminderDaysFor(type, settings);

  const [carDocs, customerDocs, licences] = await Promise.all([
    prisma.carDocument.findMany({
      include: { car: { select: { id: true, registrationNumber: true, company: true, model: true, status: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.customerDocument.findMany({
      include: { customer: { select: { id: true, fullName: true, mobile: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.customer.findMany({
      where: {
        status: { not: "INACTIVE" },
        licenseExpiry: { not: null, lte: addDays(today, settings.reminders.licenceDays) },
      },
      select: { id: true, fullName: true, mobile: true, drivingLicenseNo: true, licenseExpiry: true },
      orderBy: { licenseExpiry: "asc" },
    }),
  ]);

  const carRows: DocumentRow[] = carDocs
    .filter((d) => d.car.status !== "INACTIVE" || tab === "car")
    .map((d) => ({
      id: d.id,
      kind: "car",
      documentType: d.documentType,
      documentNumber: d.documentNumber,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      fileUrl: d.fileUrl,
      notes: d.notes,
      owner: { label: `${d.car.company} ${d.car.model}`, sub: d.car.registrationNumber, href: `/cars/${d.car.id}?tab=documents` },
    }));

  const customerRows: DocumentRow[] = customerDocs.map((d) => ({
    id: d.id,
    kind: "customer",
    documentType: d.documentType,
    documentNumber: d.documentNumber,
    issueDate: d.issueDate,
    expiryDate: d.expiryDate,
    fileUrl: d.fileUrl,
    notes: d.notes,
    owner: { label: d.customer.fullName, sub: d.customer.mobile, href: `/customers/${d.customer.id}?tab=documents` },
  }));

  const stateOf = (r: DocumentRow) => documentState(r.expiryDate, today, windowFor(r.documentType)).state;

  const matches = (r: DocumentRow) =>
    (!q ||
      r.documentType.toLowerCase().includes(q) ||
      (r.documentNumber ?? "").toLowerCase().includes(q) ||
      (r.owner?.label ?? "").toLowerCase().includes(q) ||
      (r.owner?.sub ?? "").toLowerCase().includes(q)) &&
    (!sp.type || r.documentType === sp.type) &&
    (!sp.state || stateOf(r) === sp.state);

  const attentionRows = [...carRows, ...customerRows]
    .filter((r) => ATTENTION.includes(stateOf(r)))
    .sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || (a.expiryDate?.getTime() ?? 0) - (b.expiryDate?.getTime() ?? 0));

  const rows = (tab === "attention" ? attentionRows : tab === "car" ? carRows : customerRows).filter(matches);
  const typeOptions = tab === "customer" ? CUSTOMER_DOCUMENT_TYPES : tab === "car" ? CAR_DOCUMENT_TYPES : [...CAR_DOCUMENT_TYPES, ...CUSTOMER_DOCUMENT_TYPES];

  const tabHref = (t: string) => `/documents${qs({ tab: t === "attention" ? undefined : t })}`;

  return (
    <>
      <PageHeader
        title="Documents"
        description="RC, insurance, PUC, permits and customer IDs — with expiry tracking."
        actions={
          can(actor, "documents.create") ? (
            <LinkButton href={`/documents/new${tab === "customer" ? "?kind=customer" : ""}`}>
              <FilePlus2 /> Add document
            </LinkButton>
          ) : null
        }
      />

      <Tabs
        active={tab}
        items={[
          { key: "attention", label: "Needs attention", href: tabHref("attention"), count: attentionRows.length + licences.length },
          { key: "car", label: "Car documents", href: tabHref("car"), count: carDocs.length },
          { key: "customer", label: "Customer documents", href: tabHref("customer"), count: customerDocs.length },
        ]}
      />

      <FilterBar action="/documents" resetHref={tabHref(tab)}>
        {tab !== "attention" ? <input type="hidden" name="tab" value={tab} /> : null}
        <SearchInput defaultValue={sp.q} placeholder="Number, car, customer…" />
        <FilterSelect
          name="type"
          defaultValue={sp.type}
          placeholder="All types"
          options={[...new Set(typeOptions)].map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          name="state"
          defaultValue={sp.state}
          placeholder="Any status"
          options={(Object.keys(DOC_STATE_META) as DocState[]).map((s) => ({ value: s, label: DOC_STATE_META[s].label }))}
        />
      </FilterBar>

      <DocumentTable
        rows={rows}
        windowFor={windowFor}
        canEdit={can(actor, "documents.edit")}
        canDelete={can(actor, "documents.delete")}
        emptyText={tab === "attention" ? "Every document is valid. Nothing is expiring soon." : "Nothing matches these filters."}
      />

      {tab === "attention" && licences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Customer driving licences</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Licence</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {licences.map((c) => {
                  const { state, daysLeft } = documentState(c.licenseExpiry, today, settings.reminders.licenceDays);
                  return (
                    <tr key={c.id}>
                      <Td>
                        <Link href={`/customers/${c.id}`} className="hover:text-primary">
                          {c.fullName}
                        </Link>
                        <span className="block text-[11px] text-muted">{c.mobile}</span>
                      </Td>
                      <Td className="font-mono text-xs">{c.drivingLicenseNo ?? "—"}</Td>
                      <Td className="text-xs">
                        {formatDate(c.licenseExpiry)}
                        <span className="block text-[11px] text-muted">{daysLeftLabel(daysLeft)}</span>
                      </Td>
                      <Td>
                        <Badge tone={DOC_STATE_META[state].tone}>{DOC_STATE_META[state].label}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
