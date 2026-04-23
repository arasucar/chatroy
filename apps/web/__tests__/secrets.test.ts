import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../lib/secrets";
import { estimateOpenAICostUsd } from "../lib/remote-cost";

describe("secret encryption", () => {
  it("round-trips provider keys with USER_KEY_ENCRYPTION_KEY", () => {
    const original = process.env.USER_KEY_ENCRYPTION_KEY;
    process.env.USER_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    const encrypted = encryptSecret("sk-test-secret");
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe("sk-test-secret");

    process.env.USER_KEY_ENCRYPTION_KEY = original;
  });

  it("estimates OpenAI cost for supported models", () => {
    const cost = estimateOpenAICostUsd({
      model: "gpt-5-mini",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(cost).toBeCloseTo(0.00125);
  });
});
