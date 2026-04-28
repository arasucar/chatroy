import { hasRecentStepUp, resolveSession } from "@/lib/auth";
import { createPendingTurn, saveAssistantReply } from "@/lib/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MessageCitation } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { classifyChatPrompt, classifyScriptIntent } from "@/lib/mediator";
import { startLocalChatStream, startOpenAIResponsesStream } from "@/lib/provider";
import { buildRetrievalSystemPrompt, searchDocs } from "@/lib/retrieval";
import { estimateOpenAICostUsd } from "@/lib/remote-cost";
import { createRun, finishRun } from "@/lib/runs";
import { webSearch } from "@/lib/search";
import { executeScript, getScriptById, listEnabledScripts } from "@/lib/scripts";
import { getDecryptedUserProviderKey } from "@/lib/user-provider-keys";

const SCRIPT_ROUTING_ENABLED = process.env.SCRIPT_ROUTING_ENABLED !== "false";

const encoder = new TextEncoder();

function conversationPayload(conversation: { id: string; title: string; updatedAt: Date }) {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function streamEvent(payload: object): Uint8Array {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

function buildEscalationMessage(reason: string): string {
  return `This request needs the remote escalation path. ${reason} Add an OpenAI API key in Settings to enable remote fallback for your account.`;
}

function buildProviderMessages(
  baseMessages: Array<{ role: "user" | "assistant"; content: string }>,
  citations: MessageCitation[],
) {
  return [
    ...(citations.length > 0
      ? [
          {
            role: "developer" as const,
            content: buildRetrievalSystemPrompt(citations),
          },
        ]
      : []),
    ...baseMessages,
  ];
}

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

  const decision = classifyChatPrompt(prompt);

  const searchGated =
    decision.route === "chat" && decision.tools.includes("search")
      ? session.user.searchEnabled && process.env.TAVILY_API_KEY
        ? decision
        : {
            route: "escalate" as const,
            tools: [] as [],
            provider: "remote" as const,
            model: null,
            reason: "Search requires an enabled user allowlist and a configured Tavily API key.",
          }
      : decision;

  const effectiveDecision =
    SCRIPT_ROUTING_ENABLED && searchGated.route === "chat" && searchGated.tools.length === 0
      ? await (async () => {
          const enabledScripts = await listEnabledScripts().catch(() => []);
          if (enabledScripts.length === 0) return searchGated;
          return classifyScriptIntent(prompt, enabledScripts).catch(() => searchGated);
        })()
      : searchGated;

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

  if (effectiveDecision.route === "script") {
    const scriptRl = await checkRateLimit(`chat:script:${session.user.id}`, 5, 60_000);
    if (!scriptRl.allowed) {
      return Response.json({ error: "Script rate limit exceeded." }, { status: 429 });
    }

    let scriptRun: Awaited<ReturnType<typeof executeScript>>;
    try {
      scriptRun = await executeScript({
        script: resolvedScript!,
        params: effectiveDecision.script.params,
        invokedByUserId: session.user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Script execution failed.";
      await finishRun(run.id, { status: "failed", errorMessage: message, toolsUsed: ["script"] });
      return Response.json({ error: message, conversation: conversationPayload(prepared.conversation) }, { status: 500 });
    }

    const lines: string[] = [`Ran script: **${effectiveDecision.script.name}**`];
    if (scriptRun.stdout?.trim()) lines.push("", "```", scriptRun.stdout.trim(), "```");
    if (scriptRun.stderr?.trim()) lines.push("", "**stderr:**", "```", scriptRun.stderr.trim(), "```");
    lines.push("", `Exit code: ${scriptRun.exitCode ?? "?"}`);
    const assistantReply = lines.join("\n");

    await saveAssistantReply(prepared.conversation.id, assistantReply, effectiveDecision.model, []);
    await finishRun(run.id, { status: "completed", response: assistantReply, toolsUsed: ["script"] });
    logger.info("chat.completed", { runId: run.id, route: "script", status: scriptRun.status, exitCode: scriptRun.exitCode, durationMs: Date.now() - startMs });

    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(streamEvent({ type: "conversation", conversation: conversationPayload(prepared.conversation) }));
          controller.enqueue(streamEvent({ type: "model", provider: "local", model: effectiveDecision.model }));
          controller.enqueue(streamEvent({ type: "delta", content: assistantReply }));
          controller.enqueue(streamEvent({ type: "done", conversationId: prepared.conversation.id }));
          controller.close();
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
          "content-type": "application/x-ndjson; charset=utf-8",
          "x-llm-model": `local:${effectiveDecision.model}`,
        },
      },
    );
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

  if (effectiveDecision.route === "escalate") {
    const openaiKey = await getDecryptedUserProviderKey(session.user.id, "openai");
    if (!openaiKey) {
      const assistantReply = buildEscalationMessage(effectiveDecision.reason);
      await saveAssistantReply(prepared.conversation.id, assistantReply, null, citations);
      await finishRun(run.id, {
        status: "blocked",
        response: assistantReply,
        toolsUsed,
      });

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              streamEvent({
                type: "conversation",
                conversation: conversationPayload(prepared.conversation),
              }),
            );
            controller.enqueue(
              streamEvent({
                type: "model",
                provider: "remote",
                model: "openai:not-configured",
              }),
            );
            controller.enqueue(streamEvent({ type: "delta", content: assistantReply }));
            if (citations.length > 0) {
              controller.enqueue(streamEvent({ type: "citations", citations }));
            }
            controller.enqueue(
              streamEvent({ type: "done", conversationId: prepared.conversation.id }),
            );
            controller.close();
          },
        }),
        {
          headers: {
            "cache-control": "no-store",
            "content-type": "application/x-ndjson; charset=utf-8",
            "x-llm-model": "remote:not-configured",
          },
        },
      );
    }

    const model = openaiKey.defaultModel || "gpt-5-mini";
    let upstream: Response;
    let cleanupStream: () => void = () => {};
    try {
      const result = await startOpenAIResponsesStream({
        apiKey: openaiKey.apiKey,
        model,
        messages: providerMessages,
      });
      upstream = result.response;
      cleanupStream = result.cleanup;
    } catch (error) {
      await finishRun(run.id, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to reach OpenAI.",
        toolsUsed,
      });
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Failed to reach OpenAI.",
          conversation: conversationPayload(prepared.conversation),
        },
        { status: 502 },
      );
    }

    if (!upstream.ok || !upstream.body) {
      const message = await upstream.text().catch(() => "");
      await finishRun(run.id, {
        status: "failed",
        errorMessage: message || "OpenAI response request failed.",
        toolsUsed,
      });
      return Response.json(
        {
          error: message || "OpenAI response request failed.",
          conversation: conversationPayload(prepared.conversation),
        },
        { status: upstream.status || 502 },
      );
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const responseStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let eventName = "";
        let dataLines: string[] = [];
        let assistantReply = "";
        let providerResponseId: string | null = null;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        let totalTokens: number | null = null;
        let costUsd: number | null = null;
        let finalized = false;

        const finalize = async (status: "completed" | "failed", errorMessage?: string) => {
          if (finalized) return;
          finalized = true;

          await saveAssistantReply(
            prepared.conversation.id,
            assistantReply,
            `openai:${model}`,
            citations,
          );

          await finishRun(run.id, {
            status,
            response: assistantReply,
            errorMessage: errorMessage ?? null,
            providerResponseId,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCostUsd: costUsd,
            toolsUsed,
          });
        };

        const consumeEvent = async () => {
          if (dataLines.length === 0) return;
          const data = dataLines.join("\n").trim();
          dataLines = [];
          if (!data || data === "[DONE]") return;

          const payload = JSON.parse(data) as {
            type?: string;
            delta?: string;
            error?: { message?: string };
            response?: {
              id?: string;
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                total_tokens?: number;
              };
            };
          };

          const type = payload.type || eventName;
          eventName = "";

          if (type === "response.created") {
            providerResponseId = payload.response?.id ?? providerResponseId;
            controller.enqueue(
              streamEvent({
                type: "model",
                provider: "remote",
                model: `openai:${model}`,
              }),
            );
            return;
          }

          if (type === "response.output_text.delta" && payload.delta) {
            assistantReply += payload.delta;
            controller.enqueue(streamEvent({ type: "delta", content: payload.delta }));
            return;
          }

          if (type === "response.completed") {
            providerResponseId = payload.response?.id ?? providerResponseId;
            inputTokens = payload.response?.usage?.input_tokens ?? null;
            outputTokens = payload.response?.usage?.output_tokens ?? null;
            totalTokens = payload.response?.usage?.total_tokens ?? null;
            if (inputTokens !== null && outputTokens !== null) {
              costUsd = estimateOpenAICostUsd({
                model,
                inputTokens,
                outputTokens,
              });
            }
            if (citations.length > 0) {
              controller.enqueue(streamEvent({ type: "citations", citations }));
            }
            await finalize("completed");
            controller.enqueue(
              streamEvent({ type: "done", conversationId: prepared.conversation.id }),
            );
            return;
          }

          if (type === "error") {
            const message = payload.error?.message || "OpenAI stream failed.";
            if (citations.length > 0) {
              controller.enqueue(streamEvent({ type: "citations", citations }));
            }
            await finalize("failed", message);
            controller.enqueue(streamEvent({ type: "error", error: message }));
          }
        };

        try {
          controller.enqueue(
            streamEvent({
              type: "conversation",
              conversation: conversationPayload(prepared.conversation),
            }),
          );

          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const rawLine of lines) {
              const line = rawLine.replace(/\r$/, "");

              if (!line) {
                await consumeEvent();
                continue;
              }

              if (line.startsWith("event:")) {
                eventName = line.slice("event:".length).trim();
                continue;
              }

              if (line.startsWith("data:")) {
                dataLines.push(line.slice("data:".length).trim());
              }
            }
          }

          if (buffer.trim()) {
            const trailing = buffer.replace(/\r$/, "");
            if (trailing.startsWith("data:")) {
              dataLines.push(trailing.slice("data:".length).trim());
            }
          }

          await consumeEvent();

          if (!finalized) {
            if (citations.length > 0) {
              controller.enqueue(streamEvent({ type: "citations", citations }));
            }
            await finalize("completed");
            controller.enqueue(
              streamEvent({ type: "done", conversationId: prepared.conversation.id }),
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Remote stream failed.";
          if (!finalized) {
            if (citations.length > 0) {
              controller.enqueue(streamEvent({ type: "citations", citations }));
            }
            await finalize("failed", message);
          }
          controller.enqueue(streamEvent({ type: "error", error: message }));
        } finally {
          cleanupStream();
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-llm-model": `remote:openai:${model}`,
      },
    });
  }

  const model = effectiveDecision.model;

  let upstream: Response;
  let cleanupLocalStream: () => void = () => {};
  try {
    const result = await startLocalChatStream({
      model,
      messages: providerMessages,
    });
    upstream = result.response;
    cleanupLocalStream = result.cleanup;
  } catch (error) {
    await finishRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to reach Ollama.",
      toolsUsed,
    });
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to reach Ollama.",
        conversation: conversationPayload(prepared.conversation),
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => "");
    await finishRun(run.id, {
      status: "failed",
      errorMessage: message || "Ollama chat request failed.",
      toolsUsed,
    });
    return Response.json(
      {
        error: message || "Ollama chat request failed.",
        conversation: conversationPayload(prepared.conversation),
      },
      { status: upstream.status || 502 },
    );
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let assistantReply = "";
      let saved = false;

      const flushLine = async (line: string) => {
        if (!line.trim()) return;

        const chunk = JSON.parse(line) as {
          message?: { content?: string };
          done?: boolean;
        };

        const delta = chunk.message?.content;
        if (typeof delta === "string" && delta.length > 0) {
          assistantReply += delta;
          controller.enqueue(streamEvent({ type: "delta", content: delta }));
        }

        if (chunk.done && !saved) {
          await saveAssistantReply(prepared.conversation.id, assistantReply, model, citations);
          await finishRun(run.id, { status: "completed", response: assistantReply, toolsUsed });
          logger.info("chat.completed", { runId: run.id, route: "chat", provider: "local", durationMs: Date.now() - startMs });
          saved = true;
          if (citations.length > 0) {
            controller.enqueue(streamEvent({ type: "citations", citations }));
          }
          controller.enqueue(
            streamEvent({ type: "done", conversationId: prepared.conversation.id }),
          );
        }
      };

      try {
        controller.enqueue(
          streamEvent({
            type: "conversation",
            conversation: conversationPayload(prepared.conversation),
          }),
        );
        controller.enqueue(
          streamEvent({
            type: "model",
            provider: "local",
            model,
          }),
        );

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            await flushLine(line);
          }
        }

        if (buffer.trim()) {
          await flushLine(buffer);
        }

        if (!saved) {
          await saveAssistantReply(prepared.conversation.id, assistantReply, model, citations);
          await finishRun(run.id, {
            status: "completed",
            response: assistantReply,
            toolsUsed,
          });
          if (citations.length > 0) {
            controller.enqueue(streamEvent({ type: "citations", citations }));
          }
          controller.enqueue(
            streamEvent({ type: "done", conversationId: prepared.conversation.id }),
          );
        }
      } catch (error) {
        if (!saved) {
          await saveAssistantReply(prepared.conversation.id, assistantReply, model, citations);
        }
        const errorMessage = error instanceof Error ? error.message : "Chat stream failed.";
        logger.error("chat.failed", { runId: run.id, route: "chat", provider: "local", error: errorMessage, durationMs: Date.now() - startMs });
        await finishRun(run.id, {
          status: "failed",
          response: assistantReply,
          errorMessage: error instanceof Error ? error.message : "Chat stream failed.",
          toolsUsed,
        });

        controller.enqueue(
          streamEvent({
            type: "error",
            error: error instanceof Error ? error.message : "Chat stream failed.",
          }),
        );
      } finally {
        cleanupLocalStream();
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-llm-model": `local:${model}`,
    },
  });
}
