import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { createCustomerAction } from "@/lib/actions/customer-actions";
import { PageHeader } from "@/components/ui/page-header";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer · Anish Car Rent" };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requirePermission("customers.create");
  const { returnTo } = await searchParams;
  const fromBooking = returnTo === "booking";

  return (
    <>
      <PageHeader
        title="New customer"
        description={
          fromBooking
            ? "Save the customer and you'll go straight back to the booking."
            : "Only name and mobile are required — the rest can be filled in later."
        }
      />
      <CustomerForm
        action={createCustomerAction}
        cancelHref={fromBooking ? "/bookings/new" : "/customers"}
        submitLabel={fromBooking ? "Save & continue booking" : "Save customer"}
        returnTo={fromBooking ? "booking" : undefined}
      />
    </>
  );
}
