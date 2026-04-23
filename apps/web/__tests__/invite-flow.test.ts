import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
}));

import { registerAction } from "../app/(auth)/accept/[code]/actions";

function pendingInvite(overrides?: Partial<typeof schema.invites.$inferInsert>) {
  return {
    code: "testcode123",
    status: "pending" as const,
    role: "member" as const,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe("registerAction", () => {
  beforeEach(async () => {
    await cleanDb();
    mockCookieStore.clear();
    vi.clearAllMocks();
  });

  it("creates user, marks invite accepted, creates session, logs audit events", async () => {
    expect.hasAssertions();
    await testDb.insert(schema.invites).values(pendingInvite());

    const fd = new FormData();
    fd.set("email", "new@test.local");
    fd.set("password", "securepassword123");
    fd.set("displayName", "New User");

    try {
      await registerAction("testcode123", null, fd);
    } catch (e: unknown) {
      expect((e as Error).message).toContain("REDIRECT:/dashboard");
    }

    const users = await testDb.query.users.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("new@test.local");
    expect(users[0].role).toBe("member");

    const inv = await testDb.query.invites.findFirst({ where: eq(schema.invites.code, "testcode123") });
    expect(inv?.status).toBe("accepted");
    expect(inv?.acceptedByUserId).toBe(users[0].id);

    const sessions = await testDb.query.sessions.findMany();
    expect(sessions).toHaveLength(1);

    const logs = await testDb.query.authAuditLogs.findMany();
    const events = logs.map((l) => l.event);
    expect(events).toContain("user.created");
    expect(events).toContain("invite.accepted");
  });

  it("rejects expired invite", async () => {
    await testDb.insert(schema.invites).values(
      pendingInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const fd = new FormData();
    fd.set("email", "new@test.local");
    fd.set("password", "securepassword123");
    fd.set("displayName", "New User");

    const result = await registerAction("testcode123", null, fd);
    expect(result?.error).toBe("This invite is no longer valid.");
  });

  it("rejects already-accepted invite", async () => {
    await testDb.insert(schema.invites).values(
      pendingInvite({ status: "accepted" }),
    );

    const fd = new FormData();
    fd.set("email", "new@test.local");
    fd.set("password", "pw");
    fd.set("displayName", "User");

    const result = await registerAction("testcode123", null, fd);
    expect(result?.error).toBe("This invite is no longer valid.");
  });

  it("enforces email constraint on targeted invite", async () => {
    await testDb.insert(schema.invites).values(
      pendingInvite({ email: "specific@test.local" }),
    );

    const fd = new FormData();
    fd.set("email", "other@test.local");
    fd.set("password", "pw");
    fd.set("displayName", "User");

    const result = await registerAction("testcode123", null, fd);
    expect(result?.error).toMatch(/different email/i);
  });

  it("rejects duplicate email", async () => {
    await testDb.insert(schema.users).values({
      email: "existing@test.local",
      role: "member",
    });
    await testDb.insert(schema.invites).values(pendingInvite());

    const fd = new FormData();
    fd.set("email", "existing@test.local");
    fd.set("password", "pw");
    fd.set("displayName", "User");

    const result = await registerAction("testcode123", null, fd);
    expect(result?.error).toMatch(/already exists/i);
  });
});
