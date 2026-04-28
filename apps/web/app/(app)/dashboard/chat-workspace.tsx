"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    source?: "retrieval" | "search";
    url?: string;
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
  const [stepUpRequest, setStepUpRequest] = useState<{
    prompt: string;
    scriptName: string;
  } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpPending, setStepUpPending] = useState(false);

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
    if (pending || stepUpPending) return;
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setMessages([]);
    setError(null);
    setStepUpRequest(null);
    setStepUpPassword("");
  }

  async function submitPrompt(
    submittedPrompt: string,
    options?: { allowDuringStepUp?: boolean },
  ) {
    if (!submittedPrompt || pending || (stepUpPending && !options?.allowDuringStepUp)) return;

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
    setStepUpRequest(null);
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
          stepUpRequired?: boolean;
          scriptName?: string;
        };

        if (payload.stepUpRequired) {
          setMessages((current) => current.filter((message) => message.id !== userMessage.id));
          setPrompt(submittedPrompt);
          setStepUpRequest({
            prompt: submittedPrompt,
            scriptName: payload.scriptName ?? "this script",
          });
          return;
        }

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPrompt(prompt.trim());
  }

  async function handleStepUpSubmit() {
    if (!stepUpRequest || !stepUpPassword.trim() || stepUpPending) return;

    setStepUpPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: stepUpPassword }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const pendingPrompt = stepUpRequest.prompt;
      setStepUpPassword("");
      setStepUpRequest(null);
      await submitPrompt(pendingPrompt, { allowDuringStepUp: true });
    } catch (stepUpError) {
      setError(
        stepUpError instanceof Error
          ? stepUpError.message
          : "Password confirmation failed.",
      );
    } finally {
      setStepUpPending(false);
    }
  }

  const modelLabel = pending ? "Streaming" : "Local qwen2.5";
  const statusNote = pending
    ? "Streaming response..."
    : stepUpRequest
      ? `Password confirmation required for ${stepUpRequest.scriptName}`
      : useRetrieval && documents.length > 0
        ? "Knowledge base retrieval enabled"
        : "Authenticated users only";

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <button
          className="chat-sidebar-new-btn"
          disabled={pending || stepUpPending}
          onClick={startNewConversation}
          type="button"
        >
          + New Chat
        </button>

        <p className="chat-section-label">Recent Threads</p>
        <div className="chat-conversation-list">
          {conversations.length === 0 ? (
            <p className="chat-empty-note" style={{ padding: "10px 14px" }}>
              No saved conversations yet.
            </p>
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

        <div className="chat-sidebar-footer">
          <p className="chat-section-label" style={{ padding: "0 0 8px" }}>
            Knowledge Base
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span className="tp-mono">Use docs</span>
            <span className="tp-toggle">
              <input
                checked={useRetrieval}
                disabled={documents.length === 0 || pending}
                onChange={(event) => setUseRetrieval(event.target.checked)}
                type="checkbox"
              />
              <span className="tp-toggle-track" />
              <span className="tp-toggle-thumb" />
            </span>
          </label>
          {documents.length === 0 ? (
            <p className="chat-empty-note" style={{ marginTop: 10 }}>
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
      </aside>

      <main className="chat-panel">
        <div className="chat-message-list">
          <div className="chat-message-inner">
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                <h3>Protocol Ready</h3>
                <p>
                  Hello, {userLabel}. Messages persist to Postgres and route through
                  the local engine by default.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.role === "assistant"
                      ? "chat-message chat-message-assistant"
                      : "chat-message"
                  }
                >
                  <div className="chat-message-meta">
                    <div
                      className={
                        message.role === "user"
                          ? "chat-avatar chat-avatar-user"
                          : "chat-avatar chat-avatar-sys"
                      }
                    >
                      {message.role === "user" ? "USR" : "SYS"}
                    </div>
                    <span className="chat-message-timestamp">
                      {formatTimestamp(message.createdAt)}
                    </span>
                    {message.model && <span className="tp-mono">{message.model}</span>}
                  </div>
                  <div className="chat-message-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                  {message.citations && message.citations.length > 0 && (
                    <div className="chat-citation-list">
                      <p className="chat-citation-label">Retrieved sources</p>
                      {message.citations.map((citation, index) => (
                        <div key={citation.chunkId} className="chat-citation-item">
                          <span className="chat-citation-index">[{index + 1}]</span>
                          <div>
                            <strong>{citation.documentTitle}</strong>
                            {citation.source === "search" && (
                              <span className="chat-citation-badge">Web</span>
                            )}
                            <span>{citation.excerpt}</span>
                            {citation.url && (
                              <a
                                className="chat-citation-link"
                                href={citation.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {citation.url}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        <form className="chat-input-area" onSubmit={handleSubmit}>
          {error && <p className="chat-error">{error}</p>}
          {stepUpRequest && (
            <div className="chat-stepup">
              <div>
                <p className="chat-stepup-title">Sensitive script</p>
                <p className="chat-stepup-name">{stepUpRequest.scriptName}</p>
                <p className="chat-stepup-note">
                  Confirm your password, then the original prompt retries automatically.
                </p>
              </div>
              <div className="chat-stepup-row">
                <input
                  className="tp-input"
                  type="password"
                  value={stepUpPassword}
                  onChange={(event) => setStepUpPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleStepUpSubmit();
                    }
                  }}
                  placeholder="Current password"
                  autoComplete="current-password"
                  style={{ flex: "1 1 240px", minWidth: 220 }}
                />
                <button
                  className="tp-btn tp-btn-primary"
                  disabled={stepUpPending || !stepUpPassword.trim()}
                  onClick={() => void handleStepUpSubmit()}
                  type="button"
                >
                  {stepUpPending ? "Confirming..." : "Confirm and run"}
                </button>
                <button
                  className="tp-btn tp-btn-ghost"
                  disabled={stepUpPending}
                  onClick={() => {
                    setStepUpRequest(null);
                    setStepUpPassword("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="chat-input-inner">
            <div className="tp-chip" style={{ marginBottom: 8 }}>
              <div className="tp-chip-dot" />
              <span>
                {currentConversation?.costSummary &&
                currentConversation.costSummary.totalTokens > 0
                  ? `${currentConversation.costSummary.totalTokens.toLocaleString()} tokens · $${currentConversation.costSummary.estimatedCostUsd.toFixed(4)}`
                  : modelLabel}
              </span>
            </div>
            <div className="chat-input-box">
              <textarea
                className="chat-input"
                disabled={pending || stepUpPending}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask the local model something useful."
                rows={2}
                value={prompt}
              />
              <button
                className="chat-send-btn"
                disabled={pending || stepUpPending || !prompt.trim()}
                aria-label="Send message"
                type="submit"
              >
                ↑
              </button>
            </div>
            <p className="chat-footer-note">{statusNote}</p>
          </div>
        </form>
      </main>
    </div>
  );
}
