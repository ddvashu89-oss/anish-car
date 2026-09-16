"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { normalizeRegistration } from "@/lib/fleet";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { fail, invalid, ok, type FormState } from "@/lib/actions/types";
import {
  int,
  money,
  optionalDateOnly,
  optionalInt,
  optionalMoney,
  optionalText,
  requiredMoney,
  requiredText,
} from "@/lib/validation";

const thisYear = new Date().getFullYear();

const carSchema = z.object({
  registrationNumber: z
    .string()
    .transform(normalizeRegistration)
    .pipe(z.string().min(6, "Enter the full registration number").max(20)),
  company: requiredText("Make", 60),
  model: requiredText("Model", 60),
  variant: optionalText(60),
  year: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(1990, "Year looks wrong").max(thisYear + 1, "Year looks wrong").optional(),
  ),
  colour: optionalText(40),
  fuelType: z.enum(["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"]),
  transmission: z.enum(["MANUAL", "AUTOMATIC"]),
  seatingCapacity: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(60).optional()),
  chassisNumber: optionalText(60),
  engineNumber: optionalText(60),
  currentKm: int("Odometer"),
  purchaseDate: optionalDateOnly,
  purchasePrice: optionalMoney,
  dailyRate: requiredMoney("Daily rate"),
  includedKmPerDay: int("Included km"),
  extraKmRate: money("Extra km rate"),
  extraHourRate: optionalMoney,
  securityDeposit: money("Security deposit"),
  serviceIntervalKm: optionalInt,
  serviceDueKm: optionalInt,
  nextServiceDate: optionalDateOnly,
  notes: optionalText(5000),
  status: z.enum(["AVAILABLE", "SERVICE", "INACTIVE"]).optional(),
});

const FIELDS = Object.keys(carSchema.shape);

function read(formData: FormData) {
  return Object.fromEntries(FIELDS.map((f) => [f, formData.get(f) ?? undefined]));
}

function toData(d: z.infer<typeof carSchema>) {
  return {
    registrationNumber: d.registrationNumber,
    company: d.company,
    model: d.model,
    variant: d.variant ?? null,
    year: d.year ?? null,
    colour: d.colour ?? null,
    fuelType: d.fuelType,
    transmission: d.transmission,
    seatingCapacity: d.seatingCapacity ?? null,
    chassisNumber: d.chassisNumber ?? null,
    engineNumber: d.engineNumber ?? null,
    currentKm: d.currentKm,
    purchaseDate: d.purchaseDate ?? null,
    purchasePrice: d.purchasePrice ?? null,
    dailyRate: d.dailyRate,
    includedKmPerDay: d.includedKmPerDay,
    extraKmRate: d.extraKmRate,
    extraHourRate: d.extraHourRate ?? null,
    securityDeposit: d.securityDeposit,
    serviceIntervalKm: d.serviceIntervalKm ?? null,
    serviceDueKm: d.serviceDueKm ?? (d.serviceIntervalKm ? d.currentKm + d.serviceIntervalKm : null),
    nextServiceDate: d.nextServiceDate ?? null,
    notes: d.notes ?? null,
  };
}

export async function createCarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("cars.create");
  const parsed = carSchema.safeParse(read(formData));
  if (!parsed.success) return invalid(formData, parsed.error.issues);

  const clash = await prisma.car.findUnique({ where: { registrationNumber: parsed.data.registrationNumber } });
  if (clash) return fail(formData, "A car with this registration number already exists.", { registrationNumber: "Already added" });

  const image = await saveUpload(formData.get("image"), "cars");
  if (!image.ok) return fail(formData, image.error, { image: image.error });

  const car = await prisma.car.create({
    data: { ...toData(parsed.data), status: parsed.data.status ?? "AVAILABLE", primaryImageUrl: image.path },
  });

  await recordAudit({
    userId: actor.id,
    action: "car.create",
    entity: "Car",
    entityId: car.id,
    summary: `Added ${car.company} ${car.model} (${car.registrationNumber})`,
  });

  revalidatePath("/cars");
  redirect(`/cars/${car.id}`);
}

export async function updateCarAction(carId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("cars.edit");
  const parsed = carSchema.safeParse(read(formData));
  if (!parsed.success) return invalid(formData, parsed.error.issues);

  const before = await prisma.car.findUnique({ where: { id: carId } });
  if (!before) return fail(null, "This car no longer exists.");

  const clash = await prisma.car.findUnique({ where: { registrationNumber: parsed.data.registrationNumber } });
  if (clash && clash.id !== carId) {
    return fail(formData, "Another car already has this registration number.", { registrationNumber: "Already used" });
  }

  const image = await saveUpload(formData.get("image"), "cars");
  if (!image.ok) return fail(formData, image.error, { image: image.error });

  const data = toData(parsed.data);
  await prisma.car.update({
    where: { id: carId },
    data: { ...data, ...(image.path ? { primaryImageUrl: image.path } : {}) },
  });
  if (image.path) await deleteUpload(before.primaryImageUrl);

  const tracked = ["dailyRate", "extraKmRate", "includedKmPerDay", "securityDeposit", "currentKm", "registrationNumber"] as const;
  const changed = tracked.filter((k) => String(before[k]) !== String(data[k]));
  await recordAudit({
    userId: actor.id,
    action: "car.update",
    entity: "Car",
    entityId: carId,
    summary: `Updated ${data.company} ${data.model}${changed.length ? ` (${changed.join(", ")})` : ""}`,
    oldValue: Object.fromEntries(changed.map((k) => [k, String(before[k])])),
    newValue: Object.fromEntries(changed.map((k) => [k, String(data[k])])),
  });

  revalidatePath("/cars");
  revalidatePath(`/cars/${carId}`);
  redirect(`/cars/${carId}`);
}

export async function setCarStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("cars.edit");
  const carId = Number(formData.get("carId"));
  const status = String(formData.get("status"));
  if (!["AVAILABLE", "SERVICE", "INACTIVE"].includes(status)) return fail(null, "Unknown status.");

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) return fail(null, "This car no longer exists.");

  const running = await prisma.booking.findFirst({
    where: { carId, status: { in: ["RUNNING", "HANDED_OVER"] } },
    select: { bookingNumber: true },
  });
  if (running) return fail(null, `This car is out on ${running.bookingNumber}. Return it first.`);

  if (status === "INACTIVE") {
    const upcoming = await prisma.booking.count({ where: { carId, status: "CONFIRMED" } });
    if (upcoming > 0) return fail(null, `Reassign or cancel its ${upcoming} upcoming booking(s) before deactivating.`);
  }

  await prisma.car.update({ where: { id: carId }, data: { status: status as "AVAILABLE" | "SERVICE" | "INACTIVE" } });
  await recordAudit({
    userId: actor.id,
    action: "car.status",
    entity: "Car",
    entityId: carId,
    summary: `${car.registrationNumber}: ${car.status.toLowerCase()} → ${status.toLowerCase()}`,
    oldValue: { status: car.status },
    newValue: { status },
  });

  revalidatePath("/cars");
  revalidatePath(`/cars/${carId}`);
  return ok("Status updated.");
}

export async function deleteCarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission("cars.delete");
  const carId = Number(formData.get("carId"));

  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: { _count: { select: { bookings: true, expenses: true } } },
  });
  if (!car) return fail(null, "This car no longer exists.");
  if (car._count.bookings + car._count.expenses > 0) {
    return fail(null, "This car has bookings or expenses on record. Mark it Inactive instead to keep its history.");
  }

  const [docs, images] = await Promise.all([
    prisma.carDocument.findMany({ where: { carId }, select: { fileUrl: true } }),
    prisma.carImage.findMany({ where: { carId }, select: { url: true } }),
  ]);
  await prisma.car.delete({ where: { id: carId } });
  await Promise.all([
    deleteUpload(car.primaryImageUrl),
    ...docs.map((d) => deleteUpload(d.fileUrl)),
    ...images.map((i) => deleteUpload(i.url)),
  ]);

  await recordAudit({
    userId: actor.id,
    action: "car.delete",
    entity: "Car",
    entityId: carId,
    summary: `Deleted ${car.company} ${car.model} (${car.registrationNumber})`,
  });

  revalidatePath("/cars");
  redirect("/cars");
}
