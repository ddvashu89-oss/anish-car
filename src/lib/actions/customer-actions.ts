"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextEntityCode } from "@/lib/sequence";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import {
  mobile,
  optionalDateOnly,
  optionalEmail,
  optionalMobile,
  optionalText,
  requiredText,
} from "@/lib/validation";

const customerSchema = z
  .object({
    fullName: requiredText("Name", 120),
    mobile,
    altMobile: optionalMobile,
    email: optionalEmail,
    address: optionalText(1000),
    city: optionalText(80),
    state: optionalText(80),
    pincode: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code").optional(),
    ),
    drivingLicenseNo: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().toUpperCase().max(40).optional(),
    ),
    licenseExpiry: optionalDateOnly,
    idProofType: optionalText(40),
    idProofNumber: optionalText(60),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: optionalMobile,
    customerType: z.enum(["REGULAR", "VIP", "CORPORATE"]),
    status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]),
    blacklistReason: optionalText(255),
    notes: optionalText(5000),
  })
  .refine((d) => d.status !== "BLACKLISTED" || Boolean(d.blacklistReason), {
    path: ["blacklistReason"],
    message: "Say why this customer is blacklisted",
  });

const FIELDS = [
  "fullName",
  "mobile",
  "altMobile",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "drivingLicenseNo",
  "licenseExpiry",
  "idProofType",
  "idProofNumber",
  "emergencyContactName",
  "emergencyContactPhone",
  "customerType",
  "status",
  "blacklistReason",
  "notes",
];

function read(formData: FormData) {
  return Object.fromEntries(FIELDS.map((f) => [f, formData.get(f) ?? undefined]));
}

function toData(d: z.infer<typeof customerSchema>) {
  return {
    fullName: d.fullName,
    mobile: d.mobile,
    altMobile: d.altMobile ?? null,
    email: d.email ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    pincode: d.pincode ?? null,
    drivingLicenseNo: d.drivingLicenseNo ?? null,
    licenseExpiry: d.licenseExpiry ?? null,
    idProofType: d.idProofType ?? null,
    idProofNumber: d.idProofNumber ?? null,
    emergencyContactName: d.emergencyContactName ?? null,
    emergencyContactPhone: d.emergencyContactPhone ?? null,
    customerType: d.customerType,
    status: d.status,
    blacklistReason: d.status === "BLACKLISTED" ? (d.blacklistReason ?? null) : null,
    notes: d.notes ?? null,
  };
}

export async function createCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("customers.create");
  const parsed = customerSchema.safeParse(read(formData));
  if (!parsed.success) return invalid(formData, parsed.error.issues);

  const clash = await prisma.customer.findUnique({ where: { mobile: parsed.data.mobile } });
  if (clash) {
    return fail(formData, `${clash.fullName} (${clash.customerCode}) already uses this mobile number.`, {
      mobile: "Already registered",
    });
  }

  const photo = await saveUpload(formData.get("photo"), "customers");
  if (!photo.ok) return fail(formData, photo.error, { photo: photo.error });

  const customer = await prisma.$transaction(async (tx) =>
    tx.customer.create({
      data: {
        ...toData(parsed.data),
        customerCode: await nextEntityCode("CUST", tx),
        photoUrl: photo.path,
        createdById: actor.id,
      },
    }),
  );

  await recordAudit({
    userId: actor.id,
    action: "customer.create",
    entity: "Customer",
    entityId: customer.id,
    summary: `Added customer ${customer.fullName} (${customer.customerCode})`,
  });

  revalidatePath("/customers");
  // Only ever return into the booking flow — never to an arbitrary URL from the form.
  const returnTo = String(formData.get("returnTo") ?? "");
  if (returnTo === "booking") redirect(`/bookings/new?customerId=${customer.id}`);
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomerAction(
  customerId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("customers.edit");
  const parsed = customerSchema.safeParse(read(formData));
  if (!parsed.success) return invalid(formData, parsed.error.issues);

  const before = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!before) return fail(null, "This customer no longer exists.");

  const clash = await prisma.customer.findUnique({ where: { mobile: parsed.data.mobile } });
  if (clash && clash.id !== customerId) {
    return fail(formData, `${clash.fullName} (${clash.customerCode}) already uses this mobile number.`, {
      mobile: "Already registered",
    });
  }

  const photo = await saveUpload(formData.get("photo"), "customers");
  if (!photo.ok) return fail(formData, photo.error, { photo: photo.error });

  const data = toData(parsed.data);
  await prisma.customer.update({
    where: { id: customerId },
    data: { ...data, ...(photo.path ? { photoUrl: photo.path } : {}) },
  });
  if (photo.path) await deleteUpload(before.photoUrl);

  const changed = Object.keys(data).filter(
    (k) => String(before[k as keyof typeof before] ?? "") !== String(data[k as keyof typeof data] ?? ""),
  );
  await recordAudit({
    userId: actor.id,
    action: "customer.update",
    entity: "Customer",
    entityId: customerId,
    summary: `Updated ${data.fullName}${changed.length ? `: ${changed.join(", ")}` : ""}`,
    oldValue: Object.fromEntries(changed.map((k) => [k, before[k as keyof typeof before]])),
    newValue: Object.fromEntries(changed.map((k) => [k, data[k as keyof typeof data]])),
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function deleteCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("customers.delete");
  const customerId = Number(formData.get("customerId"));

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { _count: { select: { bookings: true, payments: true, invoices: true } } },
  });
  if (!customer) return fail(null, "This customer no longer exists.");

  const { bookings, payments, invoices } = customer._count;
  if (bookings + payments + invoices > 0) {
    return fail(null, "This customer has bookings or payments on record. Mark them Inactive instead so the history stays intact.");
  }

  const docs = await prisma.customerDocument.findMany({ where: { customerId }, select: { fileUrl: true } });
  await prisma.customer.delete({ where: { id: customerId } });
  await Promise.all([deleteUpload(customer.photoUrl), ...docs.map((d) => deleteUpload(d.fileUrl))]);

  await recordAudit({
    userId: actor.id,
    action: "customer.delete",
    entity: "Customer",
    entityId: customerId,
    summary: `Deleted customer ${customer.fullName} (${customer.customerCode})`,
    oldValue: { fullName: customer.fullName, mobile: customer.mobile },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function addCustomerNoteAction(
  customerId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("customers.edit");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return fail(formData, "Write something first.", { body: "Required" });
  if (body.length > 5000) return fail(formData, "Notes are limited to 5000 characters.");

  await prisma.customerNote.create({ data: { customerId, body, authorName: actor.name } });
  revalidatePath(`/customers/${customerId}`);
  return ok("Note added.");
}

export async function deleteCustomerNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("customers.edit");
  const noteId = Number(formData.get("noteId"));
  const note = await prisma.customerNote.findUnique({ where: { id: noteId } });
  if (!note) return fail(null, "Note already removed.");
  await prisma.customerNote.delete({ where: { id: noteId } });
  revalidatePath(`/customers/${note.customerId}`);
  return ok("Note removed.");
}
