import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireDb } from "./db";
import { sessions, users } from "./db/schema";
import { getSession } from "./session";
import type { AppRole } from "@roy/shared";

export type SessionUser = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

export async function createSession(
  userId: string,
  role: AppRole,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<string> {
  const db = requireDb();
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ id: sessionId, userId, expiresAt, ipAddress, userAgent });

  const cookie = await getSession();
  cookie.sessionId = sessionId;
  cookie.userId = userId;
  cookie.role = role;
  cookie.expiresAt = expiresAt.getTime();
  delete cookie.stepUpVerifiedAt;
  await cookie.save();

  return sessionId;
}

export async function deleteSession(): Promise<void> {
  const cookie = await getSession();
  const sessionId = cookie.sessionId;

  if (sessionId) {
    try {
      const db = requireDb();
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    } catch {
      // Best effort — cookie is cleared regardless
    }
  }

  cookie.destroy();
}

export function isStepUpFreshAt(
  stepUpVerifiedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  return (
    typeof stepUpVerifiedAt === "number" &&
    Number.isFinite(stepUpVerifiedAt) &&
    stepUpVerifiedAt >= now - STEP_UP_WINDOW_MS
  );
}

export async function hasRecentStepUp(): Promise<boolean> {
  const cookie = await getSession();
  return isStepUpFreshAt(cookie.stepUpVerifiedAt);
}

export async function markStepUpVerified(): Promise<Date> {
  const cookie = await getSession();
  const verifiedAt = Date.now();
  cookie.stepUpVerifiedAt = verifiedAt;
  await cookie.save();
  return new Date(verifiedAt + STEP_UP_WINDOW_MS);
}

export async function verifyStepUpPassword(
  password: string,
): Promise<{ ok: true; expiresAt: Date } | { ok: false; error: string }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, error: "Password is required." };
  }

  const session = await resolveSession();
  if (!session?.user.passwordHash) {
    return { ok: false, error: "Unauthorized." };
  }

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(trimmed, session.user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Password confirmation failed." };
  }

  const expiresAt = await markStepUpVerified();
  return { ok: true, expiresAt };
}

export async function resolveSession(): Promise<{
  user: SessionUser;
  session: SessionRow;
} | null> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) return null;

  const cookie = await getSession();
  if (!cookie.sessionId) return null;

  const db = requireDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, cookie.sessionId), gt(sessions.expiresAt, new Date())),
  });

  if (!session) {
    cookie.destroy();
    return null;
  }

  if (session.userId !== userId) {
    cookie.destroy();
    return null;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

  if (!user) {
    cookie.destroy();
    return null;
  }

  return { user, session };
}

export async function requireSession(): Promise<{
  user: SessionUser;
  session: SessionRow;
}> {
  const sessionResult = await resolveSession();
  if (!sessionResult) redirect("/login");
  return sessionResult;
}

export async function requireAdmin(): Promise<{
  user: SessionUser;
  session: SessionRow;
}> {
  const { user, session } = await requireSession();
  if (user.role !== "admin") redirect("/dashboard");
  return { user, session };
}
