import { describe, expect, it } from "vitest";
import { classifyChatPrompt } from "../lib/mediator";

describe("classifyChatPrompt", () => {
  it("keeps ordinary private prompts on the local chat path", () => {
    const result = classifyChatPrompt("Summarize this architecture decision in two bullets.");
    expect(result.route).toBe("chat");
    expect(result.provider).toBe("local");
    expect(result.model).toBeTruthy();
  });

  it("routes time-sensitive or web-style prompts to escalate", () => {
    const result = classifyChatPrompt("What is the latest NVIDIA stock price today?");
    expect(result.route).toBe("escalate");
    expect(result.provider).toBe("remote");
    expect(result.model).toBeNull();
  });
});
