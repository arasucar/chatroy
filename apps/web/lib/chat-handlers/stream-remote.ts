import { saveAssistantReply } from "@/lib/chat";
import { startOpenAIResponsesStream } from "@/lib/provider";
import { estimateOpenAICostUsd } from "@/lib/remote-cost";
import { finishRun } from "@/lib/runs";
import { getDecryptedUserProviderKey } from "@/lib/user-provider-keys";
import { buildEscalationMessage, conversationPayload, streamEvent } from "./shared";
import type { ChatHandlerContext } from "./shared";

export async function handleRemoteStream(ctx: ChatHandlerContext): Promise<Response> {
  const { session, prepared, decision, providerMessages, citations, toolsUsed, run } = ctx;

  if (decision.route !== "escalate") {
    return Response.json({ error: "Invalid route for remote stream." }, { status: 500 });
  }

  const openaiKey = await getDecryptedUserProviderKey(session.user.id, "openai");
  if (!openaiKey) {
    const assistantReply = buildEscalationMessage(decision.reason);
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
