const http = require("node:http");
const { Readable } = require("node:stream");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const chatModel =
  process.env.OLLAMA_CHAT_MODEL || "qwen2.5:7b-instruct-q4_K_M";

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function handleStream(request, response) {
  let payload;

  try {
    const rawBody = await readRequestBody(request);
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    writeJson(response, 400, {
      error: "Request body must be valid JSON.",
    });
    return;
  }

  const prompt =
    typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    writeJson(response, 400, {
      error: "A non-empty `prompt` field is required.",
    });
    return;
  }

  const controller = new AbortController();
  response.on("close", () => {
    controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: chatModel,
        prompt,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach Ollama.";
    writeJson(response, 502, {
      error: message,
    });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => "");
    writeJson(response, upstream.status || 502, {
      error: message || "Ollama generate request failed.",
    });
    return;
  }

  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-llm-model": chatModel,
  });

  const body = Readable.fromWeb(upstream.body);
  body.on("error", (error) => {
    if (!response.headersSent) {
      writeJson(response, 502, {
        error: error instanceof Error ? error.message : "Stream failed.",
      });
      return;
    }
    response.destroy(error);
  });
  body.pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 400, {
      error: "Missing request URL.",
    });
    return;
  }

  const url = new URL(request.url, "http://llm-hello.local");

  if (request.method === "GET" && url.pathname === "/healthz") {
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("ok");
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    writeJson(response, 200, {
      service: "llm-hello",
      model: chatModel,
      streamPath: "/api/stream",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stream") {
    await handleStream(request, response);
    return;
  }

  writeJson(response, 404, {
    error: "Not found.",
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`llm-hello listening on ${port}`);
});
