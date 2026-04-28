"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { users, invites } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export type RegisterState = { error?: string; rateLimited?: boolean } | null;

export async function registerAction(
  code: string,
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = ((formData.get("email") as string | null) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string | null) ?? "";
  const displayName = ((formData.get("displayName") as string | null) ?? "").trim() || null;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const userAgent = h.get("user-agent") ?? null;

  const rl = await checkRateLimit(`accept:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return { rateLimited: true };

  const db = requireDb();

  const invite = await db.query.invites.findFirst({
    where: and(
      eq(invites.code, code),
      eq(invites.status, "pending"),
      gt(invites.expiresAt, new Date()),
    ),
  });

  if (!invite) return { error: "This invite is no longer valid." };

  if (invite.email && invite.email.toLowerCase() !== email) {
    return { error: "This invite was issued for a different email address." };
  }

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const passwordHash = await bcrypt.hash(password, 12);

  const newUserId = await db.transaction(async (tx) => {
    const existing = await tx.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) return null;

    const [newUser] = await tx
      .insert(users)
      .values({ email, passwordHash, displayName, role: invite.role })
      .returning({ id: users.id });

    await tx
      .update(invites)
      .set({ status: "accepted", acceptedByUserId: newUser.id, acceptedAt: new Date() })
      .where(eq(invites.id, invite.id));

    return newUser.id;
  });

  if (!newUserId) return { error: "An account with this email already exists." };

  await writeAuditLog({ event: "user.created", targetUserId: newUserId, inviteId: invite.id, ipAddress: ip, userAgent });
  await writeAuditLog({ event: "invite.accepted", actorUserId: newUserId, inviteId: invite.id, ipAddress: ip, userAgent });

  await createSession(newUserId, invite.role, true, ip, userAgent);

  redirect("/dashboard");
}
