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

export async function requireSession(): Promise<{
  user: SessionUser;
  session: SessionRow;
}> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) redirect("/login");

  const cookie = await getSession();
  if (!cookie.sessionId) redirect("/login");

  const db = requireDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, cookie.sessionId), gt(sessions.expiresAt, new Date())),
  });

  if (!session) {
    cookie.destroy();
    redirect("/login");
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

  if (!user) {
    cookie.destroy();
    redirect("/login");
  }

  return { user, session };
}

export async function requireAdmin(): Promise<{
  user: SessionUser;
  session: SessionRow;
} | null> {
  const { user, session } = await requireSession();
  if (user.role !== "admin") return null;
  return { user, session };
}
