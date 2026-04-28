import { hasRecentStepUp, resolveSession } from "@/lib/auth";
import { createPendingTurn } from "@/lib/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { routeRequest } from "@/lib/mediator";
import { searchDocs } from "@/lib/retrieval";
import { createRun } from "@/lib/runs";
import { webSearch } from "@/lib/search";
import { getScriptById, listEnabledScripts } from "@/lib/scripts";
import type { MessageCitation } from "@/lib/db/schema";
import { handleScriptExecution } from "@/lib/chat-handlers/execute-script";
import { handleLocalStream } from "@/lib/chat-handlers/stream-local";
import { handleRemoteStream } from "@/lib/chat-handlers/stream-remote";
import { buildProviderMessages, type ChatHandlerContext } from "@/lib/chat-handlers/shared";

const SCRIPT_ROUTING_ENABLED = process.env.SCRIPT_ROUTING_ENABLED !== "false";

export async function POST(request: Request) {
  const startMs = Date.now();
  const session = await resolveSession();
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rl = await checkRateLimit(`chat:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let payload: { prompt?: string; conversationId?: string | null; useRetrieval?: boolean };
  try {
    payload = (await request.json()) as {
      prompt?: string;
      conversationId?: string | null;
      useRetrieval?: boolean;
    };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "A non-empty `prompt` field is required." }, { status: 400 });
  }

  const enabledScripts = SCRIPT_ROUTING_ENABLED
    ? await listEnabledScripts().catch(() => [])
    : [];

  const decision = await routeRequest(prompt, { scripts: enabledScripts });

  const effectiveDecision =
    decision.route === "chat" && decision.tools.includes("search")
      ? session.searchEnabled && process.env.TAVILY_API_KEY
        ? decision
        : {
            route: "escalate" as const,
            tools: [] as [],
            provider: "remote" as const,
            model: null,
            reason: "Search requires an enabled user allowlist and a configured Tavily API key.",
          }
      : decision;

  let resolvedScript =
    effectiveDecision.route === "script"
      ? await getScriptById(effectiveDecision.script.id)
      : null;

  if (effectiveDecision.route === "script") {
    if (!resolvedScript) {
      return Response.json({ error: "Script not found." }, { status: 404 });
    }

    if (resolvedScript.requiresStepUp && !(await hasRecentStepUp())) {
      return Response.json(
        {
          error: `Script "${resolvedScript.name}" requires password confirmation before it can run.`,
          stepUpRequired: true,
          scriptName: resolvedScript.name,
        },
        { status: 403 },
      );
    }

    const scriptRl = await checkRateLimit(`chat:script:${session.user.id}`, 5, 60_000);
    if (!scriptRl.allowed) {
      return Response.json({ error: "Script rate limit exceeded." }, { status: 429 });
    }
  }

  const prepared = await createPendingTurn(
    session.user.id,
    prompt,
    payload.conversationId ?? null,
  );

  if (!prepared) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  let citations: MessageCitation[] = [];
  const toolsUsed: string[] = [];
  if (payload.useRetrieval) {
    try {
      const retrievalResults = await searchDocs(prompt);
      citations = retrievalResults;
      if (retrievalResults.length > 0) toolsUsed.push("retrieval");
    } catch {
      citations = [];
    }
  }

  if (effectiveDecision.route === "chat" && effectiveDecision.tools.includes("search")) {
    const searchResults = await webSearch(prompt);
    if (searchResults.length > 0) {
      citations = [...citations, ...searchResults];
      toolsUsed.push("search");
    }
  }

  const baseMessages = prepared.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const providerMessages = buildProviderMessages(baseMessages, citations);

  logger.info("chat.classified", {
    userId: session.user.id,
    route: effectiveDecision.route,
    tools: effectiveDecision.tools,
    ...(effectiveDecision.route === "script" && { scriptId: effectiveDecision.script.id, scriptName: effectiveDecision.script.name }),
  });

  const run = await createRun({
    conversationId: prepared.conversation.id,
    userId: session.user.id,
    decision: effectiveDecision,
    prompt,
  });

  const ctx: ChatHandlerContext = {
    session,
    prepared,
    decision: effectiveDecision,
    providerMessages,
    citations,
    toolsUsed,
    run,
    startMs,
    resolvedScript,
  };

  if (effectiveDecision.route === "script") return handleScriptExecution(ctx);
  if (effectiveDecision.route === "escalate") return handleRemoteStream(ctx);
  return handleLocalStream(ctx);
}
