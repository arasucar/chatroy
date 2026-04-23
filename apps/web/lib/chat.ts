import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "./db";
import { conversations, messages, type MessageCitation } from "./db/schema";
import { getConversationRunCostSummary } from "./runs";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

export function deriveConversationTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "New conversation";
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trimEnd()}...`;
}

export async function listConversationsForUser(userId: string): Promise<ConversationRow[]> {
  const db = requireDb();
  return db.query.conversations.findMany({
    where: eq(conversations.userId, userId),
    orderBy: [desc(conversations.updatedAt)],
  });
}

export async function getConversationThreadForUser(
  userId: string,
  conversationId: string,
): Promise<{
  conversation: ConversationRow;
  messages: MessageRow[];
  costSummary: {
    estimatedCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
} | null> {
  const db = requireDb();
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
  });

  if (!conversation) return null;

  const threadMessages = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversation.id),
    orderBy: [asc(messages.createdAt), asc(messages.id)],
  });

  const costSummary = await getConversationRunCostSummary(conversation.id);

  return { conversation, messages: threadMessages, costSummary };
}

export async function createPendingTurn(
  userId: string,
  prompt: string,
  conversationId?: string | null,
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const db = requireDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    let conversation: ConversationRow | undefined;

    if (conversationId) {
      conversation = await tx.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
      });
      if (!conversation) return null;
    } else {
      [conversation] = await tx
        .insert(conversations)
        .values({
          userId,
          title: deriveConversationTitle(prompt),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    await tx.insert(messages).values({
      conversationId: conversation.id,
      role: "user",
      content: prompt,
      createdAt: now,
    });

    await tx
      .update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, conversation.id));

    const threadMessages = await tx.query.messages.findMany({
      where: eq(messages.conversationId, conversation.id),
      orderBy: [asc(messages.createdAt), asc(messages.id)],
    });

    return { conversation, messages: threadMessages };
  });
}

export async function saveAssistantReply(
  conversationId: string,
  content: string,
  model: string | null,
  citations?: MessageCitation[] | null,
): Promise<MessageRow | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const db = requireDb();
  const now = new Date();
  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "assistant",
      content: trimmed,
      model,
      citations: citations ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(conversations)
    .set({ updatedAt: now })
    .where(eq(conversations.id, conversationId));

  return assistantMessage;
}
