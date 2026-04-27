import { describe, it, expect, afterEach, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("database initialization", () => {
  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    vi.resetModules();
  });

  it("does not throw during module import when DATABASE_URL is malformed", async () => {
    process.env.DATABASE_URL = "postgres://bad url";
    vi.resetModules();

    await expect(import("../app/(auth)/login/actions")).resolves.toBeDefined();
  });

  it("surfaces the configuration error only when the database is actually required", async () => {
    process.env.DATABASE_URL = "postgres://bad url";
    vi.resetModules();

    const { requireDb } = await import("../lib/db");

    expect(() => requireDb()).toThrow("Failed to initialize the database layer from DATABASE_URL");
  });
});
