import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateCustomerAction } from "@/lib/actions/customer-actions";
import { PageHeader } from "@/components/ui/page-header";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer · Anish Car Rent" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customers.edit");
  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId)) notFound();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  return (
    <>
      <PageHeader title={`Edit ${customer.fullName}`} description={customer.customerCode} />
      <CustomerForm
        action={updateCustomerAction.bind(null, customerId)}
        customer={customer}
        cancelHref={`/customers/${customerId}`}
        submitLabel="Save changes"
      />
    </>
  );
}
