export type ChatDecision =
  | {
      route: "chat";
      provider: "local";
      model: string;
      reason: string;
    }
  | {
      route: "escalate";
      provider: "remote";
      model: null;
      reason: string;
    };

const REMOTE_CAPABILITY_RULES: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /\b(latest|today|current|yesterday|tomorrow)\b/i,
    reason: "The request depends on time-sensitive information.",
  },
  {
    pattern: /\b(news|weather|forecast|stock|stocks|price|prices|crypto|score|scores)\b/i,
    reason: "The request points at live external data.",
  },
  {
    pattern: /\b(search|browse|google|web|internet|look up|lookup)\b/i,
    reason: "The request explicitly asks for external lookup capability.",
  },
];

export function classifyChatPrompt(
  prompt: string,
  model = process.env.OLLAMA_CHAT_MODEL || "qwen2.5:7b-instruct-q4_K_M",
): ChatDecision {
  for (const rule of REMOTE_CAPABILITY_RULES) {
    if (rule.pattern.test(prompt)) {
      return {
        route: "escalate",
        provider: "remote",
        model: null,
        reason: rule.reason,
      };
    }
  }

  return {
    route: "chat",
    provider: "local",
    model,
    reason: "The request fits the local chat path.",
  };
}
