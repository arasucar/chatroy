type ProviderMessage = {
  role: "developer" | "system" | "user" | "assistant";
  content: string;
};

const STREAM_TIMEOUT_MS = Number(process.env.OLLAMA_STREAM_TIMEOUT_MS) || 60_000;

export async function callLocalChatOnce(input: {
  messages: ProviderMessage[];
  model: string;
  ollamaBaseUrl?: string;
}): Promise<{ message: { content: string } }> {
  const baseUrl = input.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, stream: false, messages: input.messages }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Ollama chat request failed.");
  }

  return response.json() as Promise<{ message: { content: string } }>;
}

export async function startLocalChatStream(input: {
  messages: ProviderMessage[];
  model: string;
  ollamaBaseUrl?: string;
}): Promise<{ response: Response; cleanup: () => void }> {
  const baseUrl = input.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434";
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), STREAM_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timer);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      messages: input.messages,
    }),
    signal: abort.signal,
  });
  return { response, cleanup };
}

export async function generateEmbeddings(input: {
  texts: string[];
  model?: string;
  ollamaBaseUrl?: string;
}): Promise<number[][]> {
  if (input.texts.length === 0) return [];

  const baseUrl = input.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434";
  const model = input.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: input.texts,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Ollama embedding request failed.");
  }

  const payload = (await response.json()) as { embeddings?: number[][] };
  return payload.embeddings ?? [];
}

export async function startOpenAIResponsesStream(input: {
  apiKey: string;
  model: string;
  messages: ProviderMessage[];
}): Promise<{ response: Response; cleanup: () => void }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), STREAM_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timer);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      store: false,
      input: input.messages.map((message) => ({
        role: message.role === "system" ? "developer" : message.role,
        content: [{ type: "input_text", text: message.content }],
      })),
    }),
    signal: abort.signal,
  });
  return { response, cleanup };
}
