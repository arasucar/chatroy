import type { ScriptParamDefinition } from "./db/schema";
import { callLocalChatOnce } from "./provider";
import type { ScriptRow } from "./scripts";

export type ChatDecision =
  | {
      route: "chat";
      tools: ("search")[];
      provider: "local";
      model: string;
      reason: string;
    }
  | {
      route: "escalate";
      tools: [];
      provider: "remote";
      model: null;
      reason: string;
    }
  | {
      route: "script";
      tools: [];
      provider: "local";
      model: string;
      script: { id: string; name: string; params: Record<string, string | number | boolean> };
      reason: string;
    };

const SEARCH_RULES: Array<{
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
  options?: { forceEscalate?: boolean },
): ChatDecision {
  if (options?.forceEscalate) {
    return {
      route: "escalate",
      tools: [],
      provider: "remote",
      model: null,
      reason: "Forced remote escalation for this request.",
    };
  }

  for (const rule of SEARCH_RULES) {
    if (rule.pattern.test(prompt)) {
      return {
        route: "chat",
        tools: ["search"],
        provider: "local",
        model,
        reason: rule.reason,
      };
    }
  }

  return {
    route: "chat",
    tools: [],
    provider: "local",
    model,
    reason: "The request fits the local chat path.",
  };
}

function validateScriptParams(
  paramsSchema: ScriptParamDefinition[],
  rawParams: Record<string, unknown>,
): Record<string, string | number | boolean> | null {
  const result: Record<string, string | number | boolean> = {};

  for (const param of paramsSchema) {
    const raw = rawParams[param.name];

    if (raw === undefined || raw === null) {
      if (param.required) return null;
      continue;
    }

    if (param.type === "boolean") {
      result[param.name] = Boolean(raw);
      continue;
    }

    if (param.type === "number") {
      const num = Number(raw);
      if (!Number.isFinite(num)) return null;
      result[param.name] = num;
      continue;
    }

    const str = String(raw).trim();
    if (!str && param.required) return null;

    if (param.type === "enum") {
      if (!param.options?.includes(str)) return null;
      result[param.name] = str;
      continue;
    }

    result[param.name] = str;
  }

  return result;
}

function buildScriptRegistryText(scripts: ScriptRow[]): string {
  return scripts
    .map((s) => {
      const paramDesc =
        s.paramsSchema.length > 0
          ? `Params: ${s.paramsSchema
              .map((p) => {
                const opts = p.type === "enum" && p.options ? `, options: ${p.options.join("|")}` : "";
                return `${p.name} (${p.type}${opts}${p.required ? ", required" : ""})`;
              })
              .join("; ")}`
          : "No params.";
      return `- id: ${s.id}\n  name: ${s.name}\n  description: ${s.description ?? "No description."}\n  ${paramDesc}`;
    })
    .join("\n");
}

export async function routeRequest(
  prompt: string,
  opts: {
    scripts: ScriptRow[];
    model?: string;
    forceEscalate?: boolean;
    ollamaBaseUrl?: string;
  },
): Promise<ChatDecision> {
  const initial = classifyChatPrompt(prompt, opts.model, { forceEscalate: opts.forceEscalate });

  // Short-circuit: no LLM needed for search or escalate routes
  if (initial.route !== "chat" || initial.tools.length > 0) return initial;

  // No scripts configured: skip the LLM classifier entirely
  if (opts.scripts.length === 0) return initial;

  const chatFallback: ChatDecision = initial; // already a plain chat decision

  return Promise.race([
    classifyScriptIntent(prompt, opts.scripts, opts.model, { ollamaBaseUrl: opts.ollamaBaseUrl })
      .catch(() => chatFallback),
    new Promise<ChatDecision>((resolve) => setTimeout(() => resolve(chatFallback), 3000)),
  ]);
}

export async function classifyScriptIntent(
  prompt: string,
  scripts: ScriptRow[],
  model = process.env.OLLAMA_CHAT_MODEL || "qwen2.5:7b-instruct-q4_K_M",
  options?: { ollamaBaseUrl?: string },
): Promise<ChatDecision> {
  const chatFallback: ChatDecision = {
    route: "chat",
    tools: [],
    provider: "local",
    model,
    reason: "The request fits the local chat path.",
  };

  const enabled = scripts.filter((s) => s.enabled);
  if (enabled.length === 0) return chatFallback;

  const registryText = buildScriptRegistryText(enabled);

  const systemPrompt = `You are a script routing classifier. Given a user prompt and a script registry, decide if the user clearly intends to run one of the registered scripts. Respond with ONLY valid JSON — no explanation, no markdown.

Script registry:
${registryText}

Rules:
- Only select a script if the intent is unambiguous.
- Only use params declared in the script's schema.
- For enum params, only use the listed options.
- Provide all required params or do not select the script.
- If selecting: {"route":"script","scriptId":"<id>","params":{...},"reason":"<short reason>"}
- If no clear match: {"route":"chat"}`;

  let raw: { message: { content: string } };
  try {
    raw = await callLocalChatOnce({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      ollamaBaseUrl: options?.ollamaBaseUrl,
    });
  } catch {
    return chatFallback;
  }

  const content = raw.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return chatFallback;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return chatFallback;
  }

  if (parsed.route !== "script") return chatFallback;

  const selectedScript = enabled.find((s) => s.id === parsed.scriptId);
  if (!selectedScript) return chatFallback;

  const rawParams =
    parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params)
      ? (parsed.params as Record<string, unknown>)
      : {};

  const resolvedParams = validateScriptParams(selectedScript.paramsSchema, rawParams);
  if (!resolvedParams) return chatFallback;

  return {
    route: "script",
    tools: [],
    provider: "local",
    model,
    script: {
      id: selectedScript.id,
      name: selectedScript.name,
      params: resolvedParams,
    },
    reason: typeof parsed.reason === "string" ? parsed.reason : `Matched script: ${selectedScript.name}`,
  };
}
