# Implementation Plan — Invite-only AI Chatbot

Each phase ends with a usable checkpoint. Don't skip phases; the dependencies matter.

---

## Phase 0 — Infrastructure baseline

**Goal:** the stack comes up cleanly on your server and the GPU is usable from inside a container.

- Install Docker Engine + Compose plugin on the server.
- Install the NVIDIA Container Toolkit (`nvidia-ctk runtime configure --runtime=docker`, restart dockerd). Verify with `docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi`.
- Create the repo skeleton (`apps/web`, `apps/sandbox`, `packages/shared`, `docker-compose.yml`, `Caddyfile`, `.env.example`).
- Pick a domain, point DNS at the server, get Caddy serving a placeholder over HTTPS (auto-issues certs with ACME).
- `docker compose up -d postgres redis ollama` and then inside the ollama container: `ollama pull qwen2.5:7b-instruct-q4_K_M` and `ollama pull nomic-embed-text`. Confirm you can hit `http://localhost:11434/api/generate` from the host.
- Commit a README with bring-up steps so you can nuke and restore the machine cleanly.

**Exit criteria:** `curl https://yourdomain/healthz` returns 200 from a placeholder web service; `ollama run qwen2.5:7b-instruct-q4_K_M "hello"` responds in under 5 seconds.

---

## Phase 1 — Auth, invitations, admin dashboard

**Goal:** only invited users can reach anything. No AI yet.

- Scaffold Next.js (App Router, TypeScript, Tailwind). Install shadcn/ui components as you need them.
- Wire up Auth.js v5 with the credentials provider (email + password, bcrypt). Add the Drizzle adapter. Drizzle over Prisma — faster migrations, better types, and it plays nicely with pgvector later.
- Schema: `users (id, email, password_hash, role, created_at)`, `sessions`, `invitations (id, token, email, invited_by, role, expires_at, used_at, created_at)`, `audit_log`.
- Middleware: everything under `/` requires auth; `/admin` requires `role = 'admin'`. Unauthenticated users land on a generic `/login` with no public signup link.
- Invitation flow: admin creates invite → server generates a cryptographically random token → optional email send (Resend is fine for low volume) → `/accept?token=...` shows a registration form that only works if the token is valid, unexpired, and unused. On success, mark the invitation used and create the user.
- Admin dashboard at `/admin`: list users, list invitations (pending/used/expired), create invite, revoke invite, change user role, deactivate user. shadcn's data-table component is the right primitive.
- Seed one admin user via a bootstrap script you run once on the server.

**Exit criteria:** you can log in as admin, invite a second account, that second account can register via the link and log in, and neither can reach `/admin` except the admin.

**Risks:** don't roll your own password handling beyond what Auth.js gives you. Don't forget rate limiting on `/login` and `/accept` — add it in Phase 8 if not now.

---

## Phase 2 — First chat, direct to Ollama

**Goal:** an authenticated user can have a streaming conversation with Qwen. No orchestration, no tools.

- Install the Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`). Ollama exposes an OpenAI-compatible API on `/v1`, so point the provider at `http://ollama:11434/v1`.
- Schema additions: `conversations (id, user_id, title, created_at)`, `messages (id, conversation_id, role, content, metadata, created_at)`.
- Chat UI: use `useChat` from the AI SDK. One-column layout, conversation list in a sidebar, streaming markdown rendering (react-markdown + remark-gfm + a syntax highlighter).
- API route `/api/chat`: verify auth, load conversation history, stream the response back, persist user + assistant messages when the stream closes.
- System prompt: keep it minimal for now. The mediator behavior goes in Phase 3.

**Exit criteria:** you can have a back-and-forth conversation, history persists across page reloads, and token streaming feels responsive (first token under ~500ms on warm GPU).

**Risks:** Qwen's OpenAI-compat endpoint occasionally returns malformed SSE when the prompt is too long — handle stream errors gracefully and truncate old messages at a token budget.

---

## Phase 3 — Orchestrator and first tool

**Goal:** the mediator decides whether to answer directly or call a tool. Prove the agent loop works end-to-end with one tool.

- Add the LLM provider abstraction layer: a small module in `lib/llm/` that exposes `generate(messages, tools, opts)` and can route to Ollama, Anthropic, or OpenAI. Phase 6 extends it; for now just Ollama.
- Pick the orchestrator style: **LangGraph.js** if you want the graph abstraction and built-in checkpointing, or **a custom loop** (~150 lines) if you want full control. For three agents I'd lean custom.
- Define the first two "agents" as system-prompt variants of the same model: `conversation` (just chat) and `tool_user` (chat with tool-calling enabled). The mediator decides which by inspecting the user message.
- Mediator implementation: a small call to Qwen with a tight system prompt returning JSON `{ "route": "conversation" | "tool_user", "reason": "..." }`. Validate with Zod.
- First tool: Tavily web search. Register it in the tool registry with Zod input/output schemas. The tool-using agent gets the tool list injected via Qwen's tool-calling format.
- Loop: user message → mediator routes → selected agent runs (possibly calling tools in a loop until done) → response streams back. Persist tool calls and results in `messages.metadata`.
- Surface tool use in the UI: show a collapsed "Used web search" chip with expandable details. This is a trust thing — users should see what the bot did.

**Exit criteria:** "who won the latest F1 race" triggers a web search and returns a cited answer; "hello how are you" does not.

**Risks:** small models hallucinate tool calls. Add a retry with an error message to the model if the tool call doesn't match the schema. Log every mediator decision early on — you'll tune the routing prompt based on what you see.

---

## Phase 4 — RAG over your docs

**Goal:** users can upload documents and the bot can search them.

- Schema: `documents (id, owner_id, title, source, created_at)`, `chunks (id, document_id, content, embedding vector(768), token_count, chunk_index)`. Create an `ivfflat` or `hnsw` index on `embedding`.
- Upload flow: accept PDF, MD, TXT, DOCX. Parse with `pdf-parse`, `mammoth`, etc. Chunk with a semantic splitter (try `@langchain/textsplitters` — the recursive character splitter at ~800 tokens with 100 overlap is a solid default).
- Embed each chunk with `nomic-embed-text` via Ollama's `/api/embeddings`. Batch insertions.
- New tool: `search_docs({ query, top_k })` — embeds the query, runs a cosine similarity search, returns top chunks with source metadata. Register with the tool agent.
- UI: `/library` page listing documents with upload button, per-doc progress (parse → chunk → embed → ready), delete action. Mediator gets an updated system prompt mentioning that `search_docs` is available.
- Hybrid retrieval is overkill for v1; add BM25 later only if semantic recall feels off.

**Exit criteria:** upload a manual, ask a specific question from page 47, and the bot answers with a citation to that document.

**Risks:** embedding large PDFs blocks request threads. Run all ingestion through BullMQ jobs from the start. Don't `await` embedding in an HTTP handler.

---

## Phase 5 — Sandbox and code execution

**Goal:** the agent can run Python/Node code safely. This is the most security-sensitive phase; do not rush it.

- Build `sandbox-runner:latest`: a minimal Alpine or Debian-slim image with Python 3.12, Node 20, and a curated set of libraries (numpy, pandas, matplotlib, requests — but NO network by default). No shells beyond `sh`. No sudo. Non-root user.
- Build `apps/sandbox`: a tiny Fastify server exposing `POST /exec { language, code, timeout, files }`. It shells out: `docker run --rm --network=none --memory=512m --cpus=1 --pids-limit=64 --read-only --tmpfs /tmp --user 1000:1000 sandbox-runner:latest <cmd>`. Streams stdout/stderr back, captures files written to a mounted `/out`.
- Put the sandbox on its own Docker network. The orchestrator calls it over HTTP; it is never exposed to the proxy.
- New tool: `run_code({ language, code })`. Register with the tool agent.
- UI: render code blocks with a "Run" indicator when the agent invokes the tool, show stdout/stderr in an expandable panel, render generated images inline (base64-encode matplotlib PNGs from `/out`).
- Before you ship: test with the obvious attacks — fork bombs, `os.system('rm -rf /')`, outbound network probes, filesystem escapes. The runner should survive all of them.

**Exit criteria:** "plot y = sin(x) for x in 0..2π" produces an inline chart; a fork bomb gets killed at the resource limits without affecting the host.

**Risks:** Docker socket access in the sandbox service is a privileged thing — someone who compromises that service has root on your host. Mitigations: run the sandbox service itself as a rootless sidecar, or use Sysbox/Kata for an additional layer. For an invite-only app this is probably fine; for public access, upgrade to gVisor or Firecracker before opening up.

---

## Phase 6 — Remote LLM fallback

**Goal:** users with their own API keys can route hard problems to Claude or GPT.

- Schema: `user_api_keys (id, user_id, provider, encrypted_key, nonce, created_at, last_used_at)`. Encrypt with libsodium's `crypto_secretbox` using a key from `.env` that never touches the database.
- Settings page `/settings/keys`: add/remove keys per provider, test-button that pings the provider with a no-op call.
- Extend `lib/llm/` to instantiate `@ai-sdk/anthropic` or `@ai-sdk/openai` dynamically per request using the decrypted key.
- Routing logic in the mediator: add a third decision axis — "does this need a frontier model?" Heuristics to start: message length, presence of code, explicit user preference ("use Claude for this"). Keep it simple; tune later.
- UI: a small model picker in the composer — "auto" (default), "local", "claude-opus", "gpt-4", disabled options grayed out when no key is configured.
- Cost visibility: log tokens and estimated cost per assistant message. Show a running total per conversation.

**Exit criteria:** with an Anthropic key configured, "refactor this 500-line module" routes to Claude; without it, the same prompt falls back to local with a friendly note.

**Risks:** leaking a decrypted key into logs. Audit every log statement in the LLM layer. Never log the request body at INFO level.

---

## Phase 7 — MCP for custom tools

**Goal:** any tool you want to add later is a drop-in, not a fork.

- Stand up an MCP server for your custom needs (your rx-voyage APIs, internal services, whatever). Use `@modelcontextprotocol/sdk`. Can be in-process or a separate container.
- Orchestrator gets an MCP client on boot, discovers tools via the protocol, and merges them into the tool registry alongside the native ones (search, run_code, search_docs).
- Admin UI addition: an "MCP servers" page listing connected servers and their tools, with enable/disable toggles.
- Tool-level permissions: per-user or per-role allowlists on which tools can be called. Critical for multi-tenant invite scenarios.

**Exit criteria:** you add a new tool by writing an MCP server and registering its URL — no redeploys of the main app needed.

---

## Phase 8 — Hardening and ops

**Goal:** you'd let a non-technical friend use it without babysitting.

- Rate limiting on `/login`, `/accept`, `/api/chat`, `/api/upload`. Upstash or a Redis-backed middleware.
- Structured logging (pino) with request IDs flowing through the orchestrator → agent → tool chain. A single trace should show the whole run.
- Metrics: Prometheus scraping, basic dashboards for request latency, tokens/sec, queue depth, tool success rates.
- Backups: nightly `pg_dump` to an offsite bucket; a weekly restore drill into a throwaway compose file.
- Error tracking: Sentry or self-hosted GlitchTip.
- An operations runbook: how to pull a new model, rotate the auth secret, recover from a disk-full, rebuild the sandbox image.
- Graceful shutdown everywhere — drain BullMQ, flush Postgres connections, finish in-flight streams.

**Exit criteria:** you can pull the plug on the server, bring it back, and everything reconnects without manual intervention.

---

## Cross-cutting concerns (do these continuously, not at the end)

**Tests.** Unit tests for the orchestrator's routing logic (mock the LLM, assert routing decisions for canned inputs). Integration tests for the full chat path against a running Ollama in CI (GitHub Actions with a CPU-only model for speed). End-to-end smoke tests with Playwright for the login → invite → chat flows.

**Feature flags.** Gate each new tool and each new agent behind a flag in a `feature_flags` table or just env vars. Lets you test in prod with one user before enabling for everyone.

**Observability of the mediator.** Log every routing decision with the input, the model's raw output, and the final route. Build a tiny admin page that shows the last 100 decisions. You'll tune the mediator prompt by reading this, not by guessing.

**Context budget.** Qwen 7B has a 32K context but gets sloppy past ~16K. Set a hard per-turn budget (e.g. 12K) and summarize older messages into a running conversation summary once you exceed it. Implement in Phase 3 before it bites you in Phase 5.

---

## Key decision points

| When | Decision | Default I'd pick |
|---|---|---|
| Phase 1 | Drizzle vs Prisma | Drizzle |
| Phase 3 | LangGraph.js vs custom loop | Custom, ~3 agents |
| Phase 4 | Tavily vs SearXNG | Tavily for v1 |
| Phase 5 | In-compose Docker sandbox vs E2B | In-compose for invite-only |
| Phase 6 | Per-user keys vs shared | Per-user (simpler billing) |
| Phase 7 | MCP now vs MCP later | Later — only after you feel the pain of hard-coded tools |

---

## Rough ordering for the first two weeks

**Week 1:** Phase 0 end-to-end, Phase 1 through "admin can invite."

**Week 2:** Finish Phase 1 (accept flow + dashboard), ship Phase 2 (first streaming chat).

After that, each phase is roughly a week of part-time work if you've done the previous one cleanly. Phase 5 is the big one — budget more time for testing than building.
