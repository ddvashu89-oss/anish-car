"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });

  // Same message either way, so the form never reveals which emails exist.
  const invalid = { error: "Email or password is incorrect." };
  if (!user) return invalid;
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid;

  if (user.status !== "ACTIVE") {
    return { error: "This account is not active. Ask an administrator for access." };
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    userId: user.id,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) {
    await recordAudit({
      userId: user.id,
      action: "auth.logout",
      entity: "User",
      entityId: user.id,
      summary: `${user.name} signed out`,
    });
  }
  await destroySession();
  redirect("/login");
}
