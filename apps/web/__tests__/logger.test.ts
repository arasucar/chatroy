import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("emits info as JSON to stdout", async () => {
    const { logger } = await import("../lib/logger");
    logger.info("test event", { userId: "u1", route: "chat" });

    expect(console.log).toHaveBeenCalledOnce();
    const raw = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test event");
    expect(parsed.userId).toBe("u1");
    expect(parsed.route).toBe("chat");
    expect(typeof parsed.ts).toBe("string");
  });

  it("emits error to stderr", async () => {
    const { logger } = await import("../lib/logger");
    logger.error("something broke", { error: "oops" });

    expect(console.error).toHaveBeenCalledOnce();
    const raw = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.level).toBe("error");
    expect(parsed.error).toBe("oops");
  });

  it("suppresses debug logs at default info level", async () => {
    const { logger } = await import("../lib/logger");
    logger.debug("noisy debug line");

    expect(console.log).not.toHaveBeenCalled();
  });

  it("emits debug logs when LOG_LEVEL=debug", async () => {
    process.env.LOG_LEVEL = "debug";
    vi.resetModules();
    const { logger } = await import("../lib/logger");
    logger.debug("verbose debug line");

    expect(console.log).toHaveBeenCalledOnce();
    const raw = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.level).toBe("debug");
  });
});
