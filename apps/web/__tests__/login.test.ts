import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { cleanDb, testDb } from "./setup";
import { schema } from "../lib/db/schema";

vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { digest: "NEXT_REDIRECT" });
  }),
}));

const mockCookieStore: Map<string, string> = new Map();
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: (key: string) => {
      if (key === "x-forwarded-for") return "127.0.0.1";
      if (key === "user-agent") return "vitest";
      return null;
    },
  })),
  cookies: vi.fn(() => ({
    get: (name: string) => {
      const val = mockCookieStore.get(name);
      return val ? { name, value: val } : undefined;
    },
    set: (name: string, value: string) => { mockCookieStore.set(name, value); },
    delete: (name: string) => { mockCookieStore.delete(name); },
    getAll: () => [],
  })),
}));

vi.mock("../lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
}));

import { loginAction } from "../app/(auth)/login/actions";

describe("loginAction", () => {
  beforeEach(async () => {
    await cleanDb();
    mockCookieStore.clear();
    vi.clearAllMocks();
  });

  it("returns error for unknown email", async () => {
    const fd = new FormData();
    fd.set("email", "nobody@test.local");
    fd.set("password", "password");

    const result = await loginAction(null, fd);
    expect(result?.error).toBe("Invalid email or password.");
  });

  it("returns error for wrong password", async () => {
    const hash = await bcrypt.hash("correct-password", 12);
    await testDb.insert(schema.users).values({
      email: "user@test.local",
      passwordHash: hash,
      role: "member",
    });

    const fd = new FormData();
    fd.set("email", "user@test.local");
    fd.set("password", "wrong-password");

    const result = await loginAction(null, fd);
    expect(result?.error).toBe("Invalid email or password.");
  });

  it("writes auth.login_failed audit log on wrong password", async () => {
    const hash = await bcrypt.hash("correct-password", 12);
    await testDb.insert(schema.users).values({
      email: "user@test.local",
      passwordHash: hash,
      role: "member",
    });

    const fd = new FormData();
    fd.set("email", "user@test.local");
    fd.set("password", "wrong-password");

    await loginAction(null, fd);

    const logs = await testDb.query.authAuditLogs.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("auth.login_failed");
  });

  it("creates session and audit log on valid credentials", async () => {
    expect.hasAssertions();
    const hash = await bcrypt.hash("correct-password", 12);
    const [user] = await testDb.insert(schema.users).values({
      email: "user@test.local",
      passwordHash: hash,
      role: "member",
    }).returning();

    const fd = new FormData();
    fd.set("email", "user@test.local");
    fd.set("password", "correct-password");

    try {
      await loginAction(null, fd);
    } catch (e: unknown) {
      expect((e as Error).message).toContain("REDIRECT:/dashboard");
    }

    const sessionRows = await testDb.query.sessions.findMany();
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].userId).toBe(user.id);

    const logs = await testDb.query.authAuditLogs.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("auth.login_succeeded");
  });

  it("returns rateLimited when rate limiter blocks", async () => {
    const { checkRateLimit } = await import("../lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });

    const fd = new FormData();
    fd.set("email", "user@test.local");
    fd.set("password", "pw");

    const result = await loginAction(null, fd);
    expect(result?.rateLimited).toBe(true);
  });
});
