import "server-only";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";

type AuditInput = {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  summary?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

/** Never let logging break the operation it is recording. */
export async function recordAudit(input: AuditInput) {
  try {
    const headerList = await headers();
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId != null ? String(input.entityId) : null,
        summary: input.summary?.slice(0, 255),
        oldValue: input.oldValue === undefined ? undefined : JSON.parse(JSON.stringify(input.oldValue)),
        newValue: input.newValue === undefined ? undefined : JSON.parse(JSON.stringify(input.newValue)),
        ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", input.action, error);
  }
}
