import { resolveSession } from "@/lib/auth";
import { createPendingTurn, saveAssistantReply } from "@/lib/chat";
import type { MessageCitation } from "@/lib/db/schema";
import { classifyChatPrompt } from "@/lib/mediator";
import { startLocalChatStream, startOpenAIResponsesStream } from "@/lib/provider";
import { buildRetrievalSystemPrompt, searchDocs } from "@/lib/retrieval";
import { estimateOpenAICostUsd } from "@/lib/remote-cost";
import { createRun, finishRun } from "@/lib/runs";
import { getDecryptedUserProviderKey } from "@/lib/user-provider-keys";

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
  const session = await resolveSession();
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
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

  const prepared = await createPendingTurn(
    session.user.id,
    prompt,
    payload.conversationId ?? null,
  );

  if (!prepared) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const decision = classifyChatPrompt(prompt);
  const run = await createRun({
    conversationId: prepared.conversation.id,
    userId: session.user.id,
    decision,
    prompt,
  });

  let citations: MessageCitation[] = [];
  if (payload.useRetrieval) {
    try {
      citations = await searchDocs(prompt);
    } catch {
      citations = [];
    }
  }

  const baseMessages = prepared.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const providerMessages = buildProviderMessages(baseMessages, citations);

  if (decision.route === "escalate") {
    const openaiKey = await getDecryptedUserProviderKey(session.user.id, "openai");
    if (!openaiKey) {
      const assistantReply = buildEscalationMessage(decision.reason);
      await saveAssistantReply(prepared.conversation.id, assistantReply, null, citations);
      await finishRun(run.id, {
        status: "blocked",
        response: assistantReply,
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
    try {
      upstream = await startOpenAIResponsesStream({
        apiKey: openaiKey.apiKey,
        model,
        messages: providerMessages,
      });
    } catch (error) {
      await finishRun(run.id, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to reach OpenAI.",
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

  const model = decision.model;

  let upstream: Response;
  try {
    upstream = await startLocalChatStream({
      model,
      messages: providerMessages,
    });
  } catch (error) {
    await finishRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to reach Ollama.",
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
          await finishRun(run.id, {
            status: "completed",
            response: assistantReply,
          });
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
        await finishRun(run.id, {
          status: "failed",
          response: assistantReply,
          errorMessage: error instanceof Error ? error.message : "Chat stream failed.",
        });

        controller.enqueue(
          streamEvent({
            type: "error",
            error: error instanceof Error ? error.message : "Chat stream failed.",
          }),
        );
      } finally {
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
