import { getConversationThreadForUser } from "@/lib/chat";
import { resolveSession } from "@/lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const session = await resolveSession();
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const thread = await getConversationThreadForUser(session.user.id, conversationId);

  if (!thread) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  return Response.json({
    conversation: {
      id: thread.conversation.id,
      title: thread.conversation.title,
      updatedAt: thread.conversation.updatedAt.toISOString(),
      costSummary: thread.costSummary,
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      model: message.model,
      citations: message.citations ?? null,
      createdAt: message.createdAt.toISOString(),
    })),
  });
}
