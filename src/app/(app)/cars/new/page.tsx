import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { createCarAction } from "@/lib/actions/car-actions";
import { PageHeader } from "@/components/ui/page-header";
import { CarForm } from "../car-form";

export const metadata: Metadata = { title: "Add car · Anish Car Rent" };

export default async function NewCarPage() {
  await requirePermission("cars.create");
  return (
    <>
      <PageHeader title="Add car" description="Registration, rental terms and service schedule." />
      <CarForm action={createCarAction} cancelHref="/cars" submitLabel="Save car" />
    </>
  );
}
