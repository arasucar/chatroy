"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  costSummary?: {
    estimatedCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  citations: Array<{
    documentId: string;
    documentTitle: string;
    chunkId: string;
    chunkIndex: number;
    excerpt: string;
    score: number;
  }> | null;
  createdAt: string;
};

type DocumentSummary = {
  id: string;
  title: string;
  sourceName: string | null;
  updatedAt: string;
  chunkCount: number;
};

type ConversationPayload = {
  conversation: ConversationSummary;
  messages: ChatMessage[];
};

type ChatStreamEvent =
  | { type: "conversation"; conversation: ConversationSummary }
  | { type: "model"; model: string; provider: "local" | "remote" }
  | {
      type: "citations";
      citations: NonNullable<ChatMessage["citations"]>;
    }
  | { type: "delta"; content: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; error: string };

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function upsertConversation(
  current: ConversationSummary[],
  incoming: ConversationSummary,
): ConversationSummary[] {
  return [incoming, ...current.filter((conversation) => conversation.id !== incoming.id)];
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function ChatWorkspace({
  initialConversations,
  initialConversationId,
  initialConversationSummary,
  initialMessages,
  initialDocuments,
  canManageDocuments,
  userLabel,
}: {
  initialConversations: ConversationSummary[];
  initialConversationId: string | null;
  initialConversationSummary: ConversationSummary | null;
  initialMessages: ChatMessage[];
  initialDocuments: DocumentSummary[];
  canManageDocuments: boolean;
  userLabel: string;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [currentConversationId, setCurrentConversationId] = useState(initialConversationId);
  const [currentConversation, setCurrentConversation] = useState(initialConversationSummary);
  const [messages, setMessages] = useState(initialMessages);
  const [documents] = useState(initialDocuments);
  const [prompt, setPrompt] = useState("");
  const [useRetrieval, setUseRetrieval] = useState(initialDocuments.length > 0);
  const [pending, setPending] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConversation(conversationId: string, silent = false): Promise<void> {
    if (!silent) {
      setLoadingConversationId(conversationId);
      setError(null);
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as ConversationPayload;
      setCurrentConversationId(payload.conversation.id);
      setCurrentConversation(payload.conversation);
      setMessages(payload.messages);
      setConversations((current) => upsertConversation(current, payload.conversation));
    } finally {
      if (!silent) setLoadingConversationId(null);
    }
  }

  function startNewConversation() {
    if (pending) return;
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setMessages([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedPrompt = prompt.trim();
    if (!submittedPrompt || pending) return;

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: submittedPrompt,
      model: null,
      citations: null,
      createdAt: new Date().toISOString(),
    };

    const assistantPlaceholderId = `local-assistant-${Date.now()}`;
    let activeConversationId = currentConversationId;
    let sawDone = false;
    let pendingCitations: NonNullable<ChatMessage["citations"]> | null = null;

    setPrompt("");
    setPending(true);
    setError(null);
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversationId: currentConversationId,
          prompt: submittedPrompt,
          useRetrieval,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json()) as {
          error?: string;
          conversation?: ConversationSummary;
        };

        if (payload.conversation) {
          activeConversationId = payload.conversation.id;
          setCurrentConversationId(payload.conversation.id);
          setConversations((current) => upsertConversation(current, payload.conversation!));
          await loadConversation(payload.conversation.id, true);
        }

        throw new Error(payload.error ?? `Request failed with ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantStarted = false;
      let pendingModel: string | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventPayload = JSON.parse(line) as ChatStreamEvent;

          if (eventPayload.type === "conversation") {
            activeConversationId = eventPayload.conversation.id;
            setCurrentConversationId(eventPayload.conversation.id);
            setCurrentConversation(eventPayload.conversation);
            setConversations((current) =>
              upsertConversation(current, eventPayload.conversation),
            );
            continue;
          }

          if (eventPayload.type === "model") {
            pendingModel = `${eventPayload.provider}:${eventPayload.model}`;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantPlaceholderId
                  ? { ...message, model: pendingModel }
                  : message,
              ),
            );
            continue;
          }

          if (eventPayload.type === "delta") {
            if (!assistantStarted) {
              assistantStarted = true;
              setMessages((current) => [
                ...current,
                {
                  id: assistantPlaceholderId,
                  role: "assistant",
                  content: eventPayload.content,
                  model: pendingModel,
                  citations: pendingCitations,
                  createdAt: new Date().toISOString(),
                },
              ]);
            } else {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantPlaceholderId
                    ? { ...message, content: `${message.content}${eventPayload.content}` }
                    : message,
                ),
              );
            }
            continue;
          }

          if (eventPayload.type === "citations") {
            pendingCitations = eventPayload.citations;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantPlaceholderId
                  ? { ...message, citations: eventPayload.citations }
                  : message,
              ),
            );
            continue;
          }

          if (eventPayload.type === "error") {
            setError(eventPayload.error);
            continue;
          }

          if (eventPayload.type === "done") {
            sawDone = true;
            activeConversationId = eventPayload.conversationId;
          }
        }
      }

      if (buffer.trim()) {
        const eventPayload = JSON.parse(buffer) as ChatStreamEvent;
        if (eventPayload.type === "done") {
          sawDone = true;
          activeConversationId = eventPayload.conversationId;
        }
      }

      if (!activeConversationId) {
        throw new Error("Chat stream ended without a conversation id.");
      }

      await loadConversation(activeConversationId, true);
      router.refresh();

      if (!sawDone) {
        setError("The model response ended unexpectedly.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Chat request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chat-frame">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.35rem" }}>
              Phase 3 / Local Chat
            </p>
            <h1 className="chat-title">Hello, {userLabel}</h1>
          </div>
          <button
            className="chat-secondary-button"
            onClick={startNewConversation}
            type="button"
          >
            New chat
          </button>
        </div>

        <div className="chat-conversation-list">
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "rgba(255, 250, 240, 0.58)",
            }}
          >
            <div className="chat-toggle-row">
              <strong>Knowledge base</strong>
              <label className="chat-toggle-label">
                <input
                  checked={useRetrieval}
                  disabled={documents.length === 0 || pending}
                  onChange={(event) => setUseRetrieval(event.target.checked)}
                  type="checkbox"
                />
                <span>Use docs</span>
              </label>
            </div>
            {documents.length === 0 ? (
              <p className="chat-empty-note" style={{ marginTop: "0.75rem" }}>
                No uploaded documents yet.
              </p>
            ) : (
              <div className="chat-doc-list">
                {documents.slice(0, 6).map((document) => (
                  <div key={document.id} className="chat-doc-item">
                    <strong>{document.title}</strong>
                    <span>
                      {document.chunkCount} chunks
                      {document.sourceName ? ` · ${document.sourceName}` : ""}
                    </span>
                  </div>
                ))}
                {canManageDocuments && (
                  <a className="chat-doc-link" href="/admin/documents">
                    Manage documents
                  </a>
                )}
              </div>
            )}
          </div>

          {conversations.length === 0 ? (
            <p className="chat-empty-note">No saved conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={
                  conversation.id === currentConversationId
                    ? "chat-conversation-item is-active"
                    : "chat-conversation-item"
                }
                disabled={pending || loadingConversationId === conversation.id}
                onClick={() => void loadConversation(conversation.id)}
                type="button"
              >
                <strong>{conversation.title}</strong>
                <span>{formatTimestamp(conversation.updatedAt)}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="chat-panel">
        <div className="chat-panel-head">
          <div>
            <p className="chat-kicker">Default local model</p>
            <h2>qwen2.5:7b-instruct-q4_K_M</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="chat-kicker">
              Private, authenticated, and provider-aware. Retrieval stays inside the chat route.
            </p>
            {currentConversation?.costSummary && currentConversation.costSummary.totalTokens > 0 && (
              <p className="chat-kicker">
                Remote usage: {currentConversation.costSummary.totalTokens.toLocaleString()} tokens
                {" · "}
                ${currentConversation.costSummary.estimatedCostUsd.toFixed(4)}
              </p>
            )}
          </div>
        </div>

        <div className="chat-message-list">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <h3>Start the first conversation</h3>
              <p>
                Messages are saved to Postgres and the assistant responds through the
                local Ollama service.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "chat-message chat-message-user"
                    : "chat-message chat-message-assistant"
                }
              >
                <div className="chat-message-meta">
                  <strong>{message.role === "user" ? "You" : "roy"}</strong>
                  <span>
                    {formatTimestamp(message.createdAt)}
                    {message.model ? ` · ${message.model}` : ""}
                  </span>
                </div>
                <p>{message.content}</p>
                {message.citations && message.citations.length > 0 && (
                  <div className="chat-citation-list">
                    <p className="chat-citation-label">Retrieved sources</p>
                    {message.citations.map((citation, index) => (
                      <div key={citation.chunkId} className="chat-citation-item">
                        <strong>
                          [{index + 1}] {citation.documentTitle}
                        </strong>
                        <span>{citation.excerpt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          {error && <p className="chat-error">{error}</p>}
          <textarea
            className="chat-input"
            disabled={pending}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the local model something useful."
            rows={4}
            value={prompt}
          />
          <div className="chat-composer-foot">
            <p className="chat-kicker">
              {pending
                ? "Streaming response..."
                : useRetrieval && documents.length > 0
                  ? "Knowledge base retrieval enabled"
                  : "Authenticated users only"}
            </p>
            <button className="chat-primary-button" disabled={pending || !prompt.trim()} type="submit">
              {pending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
