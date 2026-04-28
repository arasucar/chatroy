import { saveAssistantReply } from "@/lib/chat";
import { logger } from "@/lib/logger";
import { startLocalChatStream } from "@/lib/provider";
import { finishRun } from "@/lib/runs";
import { conversationPayload, streamEvent } from "./shared";
import type { ChatHandlerContext } from "./shared";

export async function handleLocalStream(ctx: ChatHandlerContext): Promise<Response> {
  const { prepared, decision, providerMessages, citations, toolsUsed, run, startMs } = ctx;

  if (decision.route !== "chat") {
    return Response.json({ error: "Invalid route for local stream." }, { status: 500 });
  }
  const model = decision.model;

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
