import "server-only";

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session";

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  staffCode: string;
  avatarUrl: string | null;
  roleId: number;
  roleName: string;
  roleLabel: string;
  permissions: Set<string>;
};

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: number) {
  const headerList = await headers();
  const sid = randomBytes(32).toString("hex");

  await prisma.session.create({
    data: {
      id: sid,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
    },
  });

  const token = await signSessionToken({ sid, uid: userId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      await prisma.session.deleteMany({ where: { id: payload.sid } });
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    staffCode: session.user.staffCode,
    avatarUrl: session.user.avatarUrl,
    roleId: session.user.roleId,
    roleName: session.user.role.name,
    roleLabel: session.user.role.label,
    permissions: new Set(session.user.role.permissions.map((rp) => rp.permission.key)),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // "expired" tells the proxy to clear the cookie instead of bouncing back here — otherwise a
  // token with a valid signature but no matching session row (e.g. after a database switch)
  // would loop forever between a protected page and /login.
  if (!user) redirect("/login?expired=1");
  return user;
}

export function can(user: CurrentUser, permission: string) {
  return user.permissions.has(permission);
}

/** Server-side gate. Every page and action that touches data should start with this. */
export async function requirePermission(permission: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/no-access");
  return user;
}
