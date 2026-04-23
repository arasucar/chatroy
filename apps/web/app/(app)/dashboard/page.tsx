import { requireSession } from "@/lib/auth";
import { getConversationThreadForUser, listConversationsForUser } from "@/lib/chat";
import { listDocuments } from "@/lib/retrieval";
import { ChatWorkspace } from "./chat-workspace";

export default async function DashboardPage() {
  const { user } = await requireSession();
  const conversations = await listConversationsForUser(user.id);
  const documents = await listDocuments(12);
  const initialThread = conversations[0]
    ? await getConversationThreadForUser(user.id, conversations[0].id)
    : null;

  return (
    <main className="chat-shell">
      <ChatWorkspace
        initialConversations={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          updatedAt: conversation.updatedAt.toISOString(),
        }))}
        initialConversationId={initialThread?.conversation.id ?? null}
        initialConversationSummary={
          initialThread
            ? {
                id: initialThread.conversation.id,
                title: initialThread.conversation.title,
                updatedAt: initialThread.conversation.updatedAt.toISOString(),
                costSummary: initialThread.costSummary,
              }
            : null
        }
        initialMessages={
          initialThread?.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            model: message.model,
            citations: message.citations ?? null,
            createdAt: message.createdAt.toISOString(),
          })) ?? []
        }
        initialDocuments={documents.map((document) => ({
          id: document.id,
          title: document.title,
          sourceName: document.sourceName,
          updatedAt: document.updatedAt.toISOString(),
          chunkCount: document.chunkCount,
        }))}
        canManageDocuments={user.role === "admin"}
        userLabel={user.displayName ?? user.email}
      />
    </main>
  );
}
