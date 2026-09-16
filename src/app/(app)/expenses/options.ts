import "server-only";

import { prisma } from "@/lib/db";
import { carOptions } from "../documents/owners";

export async function expenseFormOptions() {
  const [categories, cars, vendors] = await Promise.all([
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    carOptions(),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    cars,
    vendors: vendors.map((v) => v.name),
  };
}
