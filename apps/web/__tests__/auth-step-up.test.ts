import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  getSession: vi.fn(),
}));

import { STEP_UP_WINDOW_MS, isStepUpFreshAt } from "../lib/auth";

describe("step-up auth window", () => {
  it("accepts confirmations inside the step-up window", () => {
    const now = Date.now();
    expect(isStepUpFreshAt(now - STEP_UP_WINDOW_MS + 1, now)).toBe(true);
  });

  it("rejects confirmations outside the step-up window", () => {
    const now = Date.now();
    expect(isStepUpFreshAt(now - STEP_UP_WINDOW_MS - 1, now)).toBe(false);
  });

  it("rejects missing timestamps", () => {
    expect(isStepUpFreshAt(undefined, Date.now())).toBe(false);
  });
});
