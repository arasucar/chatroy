import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, testDb } from "./setup";
import { createRun, finishRun, listRecentRuns } from "../lib/runs";
import { schema } from "../lib/db/schema";

describe("run logging", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("persists chat and escalation run decisions", async () => {
    const [user] = await testDb
      .insert(schema.users)
      .values({ email: "runner@test.local", role: "member" })
      .returning();
    const [conversation] = await testDb
      .insert(schema.conversations)
      .values({ userId: user.id, title: "Mediator test" })
      .returning();

    const localRun = await createRun({
      conversationId: conversation.id,
      userId: user.id,
      decision: {
        route: "chat",
        tools: [],
        provider: "local",
        model: "qwen2.5:7b-instruct-q4_K_M",
        reason: "The request fits the local chat path.",
      },
      prompt: "Explain this deployment in one paragraph.",
    });
    await finishRun(localRun.id, {
      status: "completed",
      response: "Here is the local answer.",
    });

    const escalatedRun = await createRun({
      conversationId: conversation.id,
      userId: user.id,
      decision: {
        route: "escalate",
        tools: [],
        provider: "remote",
        model: null,
        reason: "The request depends on time-sensitive information.",
      },
      prompt: "What is the latest weather forecast?",
    });
    await finishRun(escalatedRun.id, {
      status: "completed",
      response: "Remote provider answer.",
      providerResponseId: "resp_123",
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      estimatedCostUsd: 0.0009,
      toolsUsed: ["search"],
    });

    const runs = await listRecentRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].route).toBe("escalate");
    expect(runs[0].status).toBe("completed");
    expect(runs[0].providerResponseId).toBe("resp_123");
    expect(runs[0].totalTokens).toBe(1500);
    expect(runs[0].estimatedCostUsd).toBeCloseTo(0.0009);
    expect(runs[0].toolsUsed).toEqual(["search"]);
    expect(runs[1].route).toBe("chat");
    expect(runs[1].status).toBe("completed");
  });
});
