import { buildRetrievalSystemPrompt } from "@/lib/retrieval";
import type { MessageCitation } from "@/lib/db/schema";
import type { ProviderMessage } from "@/lib/provider";
import type { ChatDecision } from "@/lib/mediator";
import type { createPendingTurn } from "@/lib/chat";
import type { createRun } from "@/lib/runs";
import type { ScriptRow } from "@/lib/scripts";
import type { resolveSession } from "@/lib/auth";

export const encoder = new TextEncoder();

export function conversationPayload(conversation: { id: string; title: string; updatedAt: Date }) {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export function streamEvent(payload: object): Uint8Array {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

export function buildEscalationMessage(reason: string): string {
  return `This request needs the remote escalation path. ${reason} Add an OpenAI API key in Settings to enable remote fallback for your account.`;
}

export function buildProviderMessages(
  baseMessages: Array<{ role: "user" | "assistant"; content: string }>,
  citations: MessageCitation[],
): ProviderMessage[] {
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

export type ChatHandlerContext = {
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>;
  prepared: NonNullable<Awaited<ReturnType<typeof createPendingTurn>>>;
  decision: ChatDecision;
  providerMessages: ProviderMessage[];
  citations: MessageCitation[];
  toolsUsed: string[];
  run: Awaited<ReturnType<typeof createRun>>;
  startMs: number;
  resolvedScript: ScriptRow | null;
};
