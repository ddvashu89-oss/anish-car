import "server-only";

import { prisma } from "@/lib/db";

export async function carOptions() {
  const cars = await prisma.car.findMany({
    orderBy: [{ company: "asc" }, { model: "asc" }],
    select: { id: true, company: true, model: true, registrationNumber: true, status: true },
  });
  return cars.map((c) => ({
    value: c.id,
    label: `${c.registrationNumber} · ${c.company} ${c.model}${c.status === "INACTIVE" ? " (inactive)" : ""}`,
  }));
}

export async function customerOptions() {
  const customers = await prisma.customer.findMany({
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, mobile: true, customerCode: true },
  });
  return customers.map((c) => ({ value: c.id, label: `${c.fullName} · ${c.mobile}` }));
}
