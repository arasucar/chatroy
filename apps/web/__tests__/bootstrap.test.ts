import { describe, it, expect, beforeEach } from "vitest";
import { cleanDb, testDb } from "./setup";
import { schema } from "../lib/db/schema";

// We test the bootstrap by calling the register() function directly.
// It uses requireDb() internally which resolves to DATABASE_URL from env —
// which .env.test points to the test DB.

describe("admin bootstrap (instrumentation.register)", () => {
  beforeEach(async () => {
    await cleanDb();
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.ADMIN_PASSWORD = "correct-horse-battery";
  });

  it("inserts admin user on empty database", async () => {
    const { register } = await import("../instrumentation");
    await register();

    const rows = await testDb.query.users.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("admin@test.local");
    expect(rows[0].role).toBe("admin");
    expect(rows[0].passwordHash).toBeTruthy();
  });

  it("is idempotent — second call does nothing", async () => {
    const { register } = await import("../instrumentation");
    await register();
    await register();

    const rows = await testDb.query.users.findMany();
    expect(rows).toHaveLength(1);
  });

  it("does nothing when ADMIN_EMAIL is missing", async () => {
    delete process.env.ADMIN_EMAIL;
    const { register } = await import("../instrumentation");
    await register();

    const rows = await testDb.query.users.findMany();
    expect(rows).toHaveLength(0);
  });

  it("does nothing when NEXT_RUNTIME is not nodejs", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("../instrumentation");
    await register();

    const rows = await testDb.query.users.findMany();
    expect(rows).toHaveLength(0);
  });
});
