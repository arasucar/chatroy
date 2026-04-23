import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import type { SessionData } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!cookieValue) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const session = await unsealData<SessionData>(cookieValue, {
      password: process.env.AUTH_SECRET!,
    });

    if (!session.sessionId || !session.userId || !session.role || Date.now() > session.expiresAt) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-user-role", session.role);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|healthz|login($|\\/)|accept($|\\/)).*)",
  ],
};
