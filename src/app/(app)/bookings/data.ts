import "server-only";

import { prisma } from "@/lib/db";
import type { BookingCustomer } from "./booking-form";

export async function bookingCustomers(): Promise<BookingCustomer[]> {
  const customers = await prisma.customer.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, mobile: true, customerCode: true, status: true, licenseExpiry: true },
  });
  return customers.map((c) => ({ ...c, licenseExpiry: c.licenseExpiry ? c.licenseExpiry.toISOString() : null }));
}
