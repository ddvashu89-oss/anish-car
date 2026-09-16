"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { todayDateOnly } from "@/lib/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import { id, optionalDateOnly, optionalMoney, optionalText, requiredText } from "@/lib/validation";

const schema = z
  .object({
    kind: z.enum(["car", "customer"]),
    ownerId: id("car or customer"),
    documentType: requiredText("Document type", 60),
    documentNumber: optionalText(80),
    issuedBy: optionalText(120),
    issueDate: optionalDateOnly,
    expiryDate: optionalDateOnly,
    amount: optionalMoney,
    notes: optionalText(255),
    recordExpense: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((d) => !d.issueDate || !d.expiryDate || d.expiryDate >= d.issueDate, {
    path: ["expiryDate"],
    message: "Expiry must be after the issue date",
  })
  .refine((d) => !d.recordExpense || (d.amount ?? 0) > 0, {
    path: ["amount"],
    message: "Enter the amount to record it as an expense",
  });

function read(formData: FormData) {
  const kind = formData.get("kind");
  return {
    kind,
    ownerId: formData.get(kind === "car" ? "carId" : "customerId"),
    documentType: formData.get("documentType"),
    documentNumber: formData.get("documentNumber"),
    issuedBy: formData.get("issuedBy"),
    issueDate: formData.get("issueDate"),
    expiryDate: formData.get("expiryDate"),
    amount: formData.get("amount"),
    notes: formData.get("notes"),
    recordExpense: formData.get("recordExpense"),
  };
}

function expenseCategoryFor(documentType: string) {
  const t = documentType.toLowerCase();
  if (t.includes("insurance")) return "Insurance";
  if (t.includes("puc")) return "PUC";
  return "Other";
}

export async function saveDocumentAction(
  existing: { kind: "car" | "customer"; id: number } | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission(existing ? "documents.edit" : "documents.create");
  const parsed = schema.safeParse(read(formData));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) =>
      i.path[0] === "ownerId" ? { ...i, path: [formData.get("kind") === "car" ? "carId" : "customerId"] } : i,
    );
    return invalid(formData, issues);
  }
  const d = parsed.data;
  if (existing && existing.kind !== d.kind) return fail(formData, "A document cannot be moved between a car and a customer.");

  const upload = await saveUpload(formData.get("file"), "documents");
  if (!upload.ok) return fail(formData, upload.error, { file: upload.error });

  let ownerHref: string;
  let docId: number;

  if (d.kind === "car") {
    const car = await prisma.car.findUnique({ where: { id: d.ownerId } });
    if (!car) return fail(formData, "That car no longer exists.", { carId: "Not found" });
    ownerHref = `/cars/${car.id}?tab=documents`;

    const data = {
      carId: car.id,
      documentType: d.documentType,
      documentNumber: d.documentNumber ?? null,
      issuedBy: d.issuedBy ?? null,
      issueDate: d.issueDate ?? null,
      expiryDate: d.expiryDate ?? null,
      amount: d.amount ?? null,
      notes: d.notes ?? null,
    };

    if (existing) {
      const before = await prisma.carDocument.findUnique({ where: { id: existing.id } });
      if (!before) return fail(null, "This document no longer exists.");
      await prisma.carDocument.update({
        where: { id: existing.id },
        data: { ...data, ...(upload.path ? { fileUrl: upload.path } : {}) },
      });
      if (upload.path) await deleteUpload(before.fileUrl);
      docId = existing.id;
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const doc = await tx.carDocument.create({ data: { ...data, fileUrl: upload.path } });
        if (d.recordExpense && d.amount) {
          const categoryName = expenseCategoryFor(d.documentType);
          const category =
            (await tx.expenseCategory.findUnique({ where: { name: categoryName } })) ??
            (await tx.expenseCategory.create({ data: { name: categoryName } }));
          await tx.expense.create({
            data: {
              expenseNo: await nextDocumentNumber("EXP", tx),
              expenseDate: d.issueDate ?? todayDateOnly(),
              carId: car.id,
              categoryId: category.id,
              amount: d.amount,
              description: `${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""}${d.issuedBy ? ` · ${d.issuedBy}` : ""}`,
              billUrl: upload.path,
              createdById: actor.id,
            },
          });
        }
        return doc;
      });
      docId = created.id;
    }
  } else {
    const customer = await prisma.customer.findUnique({ where: { id: d.ownerId } });
    if (!customer) return fail(formData, "That customer no longer exists.", { customerId: "Not found" });
    ownerHref = `/customers/${customer.id}?tab=documents`;

    const data = {
      customerId: customer.id,
      documentType: d.documentType,
      documentNumber: d.documentNumber ?? null,
      issueDate: d.issueDate ?? null,
      expiryDate: d.expiryDate ?? null,
      notes: d.notes ?? null,
    };

    const before = existing ? await prisma.customerDocument.findUnique({ where: { id: existing.id } }) : null;
    if (existing && !before) return fail(null, "This document no longer exists.");

    docId = await prisma.$transaction(async (tx) => {
      const savedId = existing
        ? (
            await tx.customerDocument.update({
              where: { id: existing.id },
              data: { ...data, ...(upload.path ? { fileUrl: upload.path } : {}) },
            })
          ).id
        : (await tx.customerDocument.create({ data: { ...data, fileUrl: upload.path } })).id;

      // The licence on the customer profile drives licence reminders; keep it in step.
      if (d.documentType === "Driving Licence") {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ...(d.documentNumber ? { drivingLicenseNo: d.documentNumber.toUpperCase() } : {}),
            ...(d.expiryDate ? { licenseExpiry: d.expiryDate } : {}),
          },
        });
      }
      return savedId;
    });
    if (upload.path && before) await deleteUpload(before.fileUrl);
  }

  await recordAudit({
    userId: actor.id,
    action: existing ? "document.update" : "document.create",
    entity: d.kind === "car" ? "CarDocument" : "CustomerDocument",
    entityId: docId,
    summary: `${existing ? "Updated" : "Added"} ${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""}`,
  });

  revalidatePath("/documents");
  revalidatePath(ownerHref.split("?")[0]);
  const back = String(formData.get("returnTo") ?? "");
  redirect(back === "documents" ? "/documents" : ownerHref);
}

export async function deleteDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("documents.delete");
  const kind = formData.get("kind");
  const docId = Number(formData.get("documentId"));

  if (kind === "car") {
    const doc = await prisma.carDocument.findUnique({ where: { id: docId } });
    if (!doc) return fail(null, "Already deleted.");
    await prisma.carDocument.delete({ where: { id: docId } });
    await deleteUpload(doc.fileUrl);
    await recordAudit({ userId: actor.id, action: "document.delete", entity: "CarDocument", entityId: docId, summary: `Deleted ${doc.documentType}` });
    revalidatePath(`/cars/${doc.carId}`);
  } else if (kind === "customer") {
    const doc = await prisma.customerDocument.findUnique({ where: { id: docId } });
    if (!doc) return fail(null, "Already deleted.");
    await prisma.customerDocument.delete({ where: { id: docId } });
    await deleteUpload(doc.fileUrl);
    await recordAudit({ userId: actor.id, action: "document.delete", entity: "CustomerDocument", entityId: docId, summary: `Deleted ${doc.documentType}` });
    revalidatePath(`/customers/${doc.customerId}`);
  } else {
    return fail(null, "Unknown document.");
  }

  revalidatePath("/documents");
  return ok("Document deleted.");
}
