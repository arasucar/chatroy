type ProviderMessage = {
  role: "developer" | "system" | "user" | "assistant";
  content: string;
};

export async function startLocalChatStream(input: {
  messages: ProviderMessage[];
  model: string;
  ollamaBaseUrl?: string;
}): Promise<Response> {
  const baseUrl = input.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434";

  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      messages: input.messages,
    }),
  });
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
}): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
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
  });
}
