import { saveAssistantReply } from "@/lib/chat";
import { logger } from "@/lib/logger";
import { finishRun } from "@/lib/runs";
import { executeScript } from "@/lib/scripts";
import { conversationPayload, streamEvent } from "./shared";
import type { ChatHandlerContext } from "./shared";

export async function handleScriptExecution(ctx: ChatHandlerContext): Promise<Response> {
  const { session, prepared, decision, resolvedScript, run, startMs } = ctx;

  if (decision.route !== "script") {
    return Response.json({ error: "Invalid route for script execution." }, { status: 500 });
  }

  if (!resolvedScript) {
    return Response.json({ error: "Script not found." }, { status: 500 });
  }

  let scriptRun: Awaited<ReturnType<typeof executeScript>>;
  try {
    scriptRun = await executeScript({
      script: resolvedScript,
      params: decision.script.params,
      invokedByUserId: session.user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Script execution failed.";
    await finishRun(run.id, { status: "failed", errorMessage: message, toolsUsed: ["script"] });
    return Response.json({ error: message, conversation: conversationPayload(prepared.conversation) }, { status: 500 });
  }

  const lines: string[] = [`Ran script: **${decision.script.name}**`];
  if (scriptRun.stdout?.trim()) lines.push("", "```", scriptRun.stdout.trim(), "```");
  if (scriptRun.stderr?.trim()) lines.push("", "**stderr:**", "```", scriptRun.stderr.trim(), "```");
  lines.push("", `Exit code: ${scriptRun.exitCode ?? "?"}`);
  const assistantReply = lines.join("\n");

  await saveAssistantReply(prepared.conversation.id, assistantReply, decision.model, []);
  await finishRun(run.id, { status: "completed", response: assistantReply, toolsUsed: ["script"] });
  logger.info("chat.completed", { runId: run.id, route: "script", status: scriptRun.status, exitCode: scriptRun.exitCode, durationMs: Date.now() - startMs });

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(streamEvent({ type: "conversation", conversation: conversationPayload(prepared.conversation) }));
        controller.enqueue(streamEvent({ type: "model", provider: "local", model: decision.model }));
        controller.enqueue(streamEvent({ type: "delta", content: assistantReply }));
        controller.enqueue(streamEvent({ type: "done", conversationId: prepared.conversation.id }));
        controller.close();
      },
    }),
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-llm-model": `local:${decision.model}`,
      },
    },
  );
}
