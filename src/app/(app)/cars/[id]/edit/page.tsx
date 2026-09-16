import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateCarAction } from "@/lib/actions/car-actions";
import { PageHeader } from "@/components/ui/page-header";
import { CarForm } from "../../car-form";

export const metadata: Metadata = { title: "Edit car · Anish Car Rent" };

export default async function EditCarPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("cars.edit");
  const carId = Number((await params).id);
  if (!Number.isInteger(carId)) notFound();

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) notFound();

  return (
    <>
      <PageHeader title={`Edit ${car.company} ${car.model}`} description={car.registrationNumber} />
      <CarForm
        action={updateCarAction.bind(null, carId)}
        car={car}
        cancelHref={`/cars/${carId}`}
        submitLabel="Save changes"
      />
    </>
  );
}
