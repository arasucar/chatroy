import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { AppRole } from "@roy/shared";

export interface SessionData {
  sessionId: string;
  userId: string;
  role: AppRole;
  expiresAt: number; // Unix ms
  searchEnabled: boolean;
  stepUpVerifiedAt?: number;
}

export const SESSION_COOKIE_NAME = "roy_session";

export function getSessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: process.env.AUTH_SECRET!,
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}
