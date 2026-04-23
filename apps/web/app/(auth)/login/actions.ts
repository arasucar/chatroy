"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export type LoginState = { error?: string; rateLimited?: boolean } | null;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = ((formData.get("email") as string | null) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string | null) ?? "";

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const userAgent = h.get("user-agent") ?? null;

  const rl = await checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) return { rateLimited: true };

  const db = requireDb();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (!user?.passwordHash) {
    await bcrypt.hash("timing-safe-dummy", 12);
    await writeAuditLog({ event: "auth.login_failed", ipAddress: ip, userAgent, metadata: { reason: "user_not_found" } });
    return { error: "Invalid email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await writeAuditLog({ event: "auth.login_failed", targetUserId: user.id, ipAddress: ip, userAgent, metadata: { reason: "wrong_password" } });
    return { error: "Invalid email or password." };
  }

  await createSession(user.id, user.role, ip, userAgent);
  await writeAuditLog({ event: "auth.login_succeeded", actorUserId: user.id, ipAddress: ip, userAgent });

  redirect("/dashboard");
}
