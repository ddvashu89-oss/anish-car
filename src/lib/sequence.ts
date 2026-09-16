import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

async function bump(prefix: string, year: number, client?: Tx) {
  const run = (tx: Tx) =>
    tx.numberSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
  const row = client ? await run(client) : await prisma.$transaction(run);
  return row.lastNumber;
}

/**
 * BK-2026-00001, INV-2026-00001, … Counters restart each calendar year.
 * Pass the surrounding transaction so a rolled-back save does not burn a number.
 */
export async function nextDocumentNumber(prefix: string, client?: Tx, width = 5) {
  const year = new Date().getFullYear();
  const n = await bump(prefix, year, client);
  return `${prefix}-${year}-${String(n).padStart(width, "0")}`;
}

/** CUST-00001, STF-00001 — codes that never restart. */
export async function nextEntityCode(prefix: string, client?: Tx, width = 5) {
  const n = await bump(prefix, 0, client);
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
