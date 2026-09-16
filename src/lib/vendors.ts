import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/** Vendors are picked by name; a new name creates the vendor. */
export async function vendorIdFor(tx: Prisma.TransactionClient, name: string | undefined) {
  if (!name) return null;
  const existing = await tx.vendor.findFirst({ where: { name } });
  if (existing) return existing.id;
  return (await tx.vendor.create({ data: { name } })).id;
}
