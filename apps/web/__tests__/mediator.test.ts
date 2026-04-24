import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyChatPrompt, classifyScriptIntent } from "../lib/mediator";
import type { ScriptRow } from "../lib/scripts";

vi.mock("../lib/provider", () => ({
  callLocalChatOnce: vi.fn(),
  startLocalChatStream: vi.fn(),
  generateEmbeddings: vi.fn(),
  startOpenAIResponsesStream: vi.fn(),
}));

import { callLocalChatOnce } from "../lib/provider";

const mockCallLocalChatOnce = vi.mocked(callLocalChatOnce);

function makeScript(overrides: Partial<ScriptRow> = {}): ScriptRow {
  return {
    id: "script-id-1",
    name: "service-status",
    description: "Check service status",
    command: "/usr/bin/systemctl",
    argvTemplate: ["status", "{service}"],
    paramsSchema: [
      { name: "service", label: "Service", type: "string", required: true },
    ],
    enabled: true,
    requiresStepUp: false,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("classifyChatPrompt", () => {
  it("keeps ordinary private prompts on the local chat path with no tools", () => {
    const result = classifyChatPrompt("Summarize this architecture decision in two bullets.");
    expect(result.route).toBe("chat");
    expect(result.provider).toBe("local");
    expect(result.tools).toEqual([]);
    expect(result.model).toBeTruthy();
  });

  it("routes search-intent prompts to chat with tools=[search]", () => {
    const result = classifyChatPrompt("What is the latest NVIDIA stock price today?");
    expect(result.route).toBe("chat");
    expect(result.provider).toBe("local");
    expect(result.tools).toEqual(["search"]);
  });

  it("routes explicit search requests to chat with tools=[search]", () => {
    const result = classifyChatPrompt("Search the web for the best Postgres extensions.");
    expect(result.route).toBe("chat");
    expect(result.tools).toEqual(["search"]);
  });

  it("escalate result always has tools=[]", () => {
    const result = classifyChatPrompt(
      "Summarize this architecture decision in two bullets.",
      "qwen2.5:7b",
      { forceEscalate: true },
    );
    expect(result.route).toBe("escalate");
    expect(result.tools).toEqual([]);
  });
});

describe("classifyScriptIntent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns chat fallback when no enabled scripts exist", async () => {
    const result = await classifyScriptIntent("restart the web service", []);
    expect(result.route).toBe("chat");
  });

  it("returns chat fallback when all scripts are disabled", async () => {
    const script = makeScript({ enabled: false });
    const result = await classifyScriptIntent("restart the web service", [script]);
    expect(result.route).toBe("chat");
  });

  it("returns script decision when LLM selects a matching script", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockResolvedValue({
      message: {
        content: JSON.stringify({
          route: "script",
          scriptId: "script-id-1",
          params: { service: "nginx" },
          reason: "User wants to check nginx status.",
        }),
      },
    });

    const result = await classifyScriptIntent("check the nginx service status", [script]);
    expect(result.route).toBe("script");
    if (result.route === "script") {
      expect(result.script.id).toBe("script-id-1");
      expect(result.script.name).toBe("service-status");
      expect(result.script.params).toEqual({ service: "nginx" });
      expect(result.provider).toBe("local");
      expect(result.tools).toEqual([]);
    }
  });

  it("falls back to chat when LLM returns route=chat", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockResolvedValue({
      message: { content: JSON.stringify({ route: "chat" }) },
    });

    const result = await classifyScriptIntent("tell me about nginx", [script]);
    expect(result.route).toBe("chat");
  });

  it("falls back to chat when LLM returns an unknown scriptId", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockResolvedValue({
      message: {
        content: JSON.stringify({
          route: "script",
          scriptId: "nonexistent-id",
          params: {},
          reason: "Hallucinated script.",
        }),
      },
    });

    const result = await classifyScriptIntent("do something", [script]);
    expect(result.route).toBe("chat");
  });

  it("falls back to chat when LLM returns invalid enum param", async () => {
    const script = makeScript({
      paramsSchema: [
        { name: "env", label: "Environment", type: "enum", required: true, options: ["dev", "prod"] },
      ],
    });
    mockCallLocalChatOnce.mockResolvedValue({
      message: {
        content: JSON.stringify({
          route: "script",
          scriptId: "script-id-1",
          params: { env: "staging" },
          reason: "User wants staging.",
        }),
      },
    });

    const result = await classifyScriptIntent("run in staging", [script]);
    expect(result.route).toBe("chat");
  });

  it("falls back to chat when LLM call throws", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockRejectedValue(new Error("Ollama unreachable"));

    const result = await classifyScriptIntent("check nginx status", [script]);
    expect(result.route).toBe("chat");
  });

  it("falls back to chat when LLM returns malformed JSON", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockResolvedValue({
      message: { content: "I would run the nginx script!" },
    });

    const result = await classifyScriptIntent("check nginx status", [script]);
    expect(result.route).toBe("chat");
  });

  it("extracts JSON wrapped in markdown code block", async () => {
    const script = makeScript();
    mockCallLocalChatOnce.mockResolvedValue({
      message: {
        content: "```json\n" + JSON.stringify({
          route: "script",
          scriptId: "script-id-1",
          params: { service: "postgres" },
          reason: "Check postgres.",
        }) + "\n```",
      },
    });

    const result = await classifyScriptIntent("check postgres service", [script]);
    expect(result.route).toBe("script");
    if (result.route === "script") {
      expect(result.script.params).toEqual({ service: "postgres" });
    }
  });
});
