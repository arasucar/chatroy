# Implementation Plan — Invite-only AI Chatbot (Host-aware)

This plan replaces the original "blank server" roadmap with one that fits the
machine this repo will actually run on.

The key constraint is simple: this is already a live Docker host. Phase 0 must
adopt the environment without breaking existing services.

## Current repo assets to keep

These are worth keeping and extending instead of rewriting:

- `docker-compose.yml` as the base stack definition
- `Caddyfile.fresh-host` as a fresh-host ingress option
- `apps/web-placeholder` as a healthcheck target until the real app ships
- `scripts/bootstrap-server.sh` for fresh-host installs only
- `scripts/pull-models.sh` for Ollama model management

## Host facts this plan is based on

Validated on April 23, 2026:

- Ubuntu `24.04.4 LTS`
- Docker `29.3.1`
- Docker Compose `v5.1.1`
- NVIDIA Container Toolkit installed and working
- GPU: `RTX 2060 SUPER`, `8 GiB` VRAM
- CPU: `8` cores
- RAM: `15 GiB`
- Disk: roughly `640 GiB` free on `/`
- Existing Docker workloads already running on the host
- Port `5432` already in use by another Postgres container

These facts drive the implementation choices below:

- Avoid restarting Docker on this machine unless there is a maintenance window.
- Avoid binding standard service ports on the host unless there is a real need.
- Keep the local model strategy conservative; 8 GiB VRAM is enough for a useful
  mediator, but not for sloppy multi-model concurrency.
- Prefer incremental adoption of the existing host ingress pattern over
  assuming a fresh public edge.

## Current status snapshot

Validated in repo and on host on April 23, 2026:

- Phase 0 / Project 1 is materially complete in `live-host` mode.
  - `ollama` and `llm-hello` are running on this host.
  - `127.0.0.1:3005/api/stream` streamed NDJSON successfully from
    `qwen2.5:7b-instruct-q4_K_M`.
  - No host-port collision was introduced; `5432` remains occupied by another
    stack, while Project 1 stays on `3005`.
- Phase 1 is implemented and build-verified.
  - `apps/web` exists as the real app.
  - `npm run build` passes.
  - `/healthz` is served by the Next.js app.
- Phase 2 is implemented in code and test-verified.
  - Invite-only auth, admin bootstrap, invite acceptance, role checks, session
    persistence, and Redis-backed rate limiting are present in `apps/web`.
  - `npm test` passes with coverage for bootstrap, login, invite flow, rate
    limiting, mediator classification, and run persistence.
- Phase 3 is implemented in code, build-verified, and deployed.
  - Authenticated users can stream chat against the local Ollama model.
  - Conversation and message persistence back the dashboard chat UI.
  - `roy.rxstud.io` is wired to the private web app through the existing
    `cloudflared` tunnel path.
- Phase 4 is implemented narrowly.
  - `/api/chat` now flows through a deterministic mediator with the staged
    Project 2 classifier shape: `{ route: "chat" | "escalate", ... }`.
  - Mediator decisions are persisted in a `runs` table and exposed at
    `/admin/runs`.
  - The local provider path stays default; escalation is logged and blocked
    cleanly until remote-provider support lands.
- Phase 5 is implemented in code, build-verified, and deployed.
  - Admins can upload plain-text or markdown documents at `/admin/documents`.
  - Documents are chunked, embedded with `nomic-embed-text`, and stored in
    Postgres using `pgvector`.
  - The dashboard chat can opt into `search_docs`, and assistant replies now
    show retrieved citations when retrieval was used.
- Phase 6 is implemented in code, build-verified, and deployed.
  - Users can store an encrypted OpenAI API key and default remote model at
    `/settings`.
  - The mediator still uses the staged Project 2 two-route shape
    (`chat | escalate`), but `escalate` can now call the configured remote
    provider instead of only blocking.
  - Remote runs record provider response IDs, token usage, and estimated
    conversation cost, and the UI exposes the answering provider/model.
- The immediate frontier is Phase 7: controlled external actions, starting with
  web search and explicit per-tool permissions.

One caveat: `fresh-host` ingress still proxies `web`, not `llm-hello`, so the
Project 1 verification above is specifically for the current `live-host`
deployment path on this machine.

## Principles

- Build on the current repo instead of replacing it.
- Separate "fresh server bootstrap" from "deploy on an existing live server."
- Treat Phase 0 as a no-downtime adoption phase, not just a placeholder page.
- Ship the smallest useful product path first: invite-only auth, chat, local
  model, then carefully add tools.
- Do not introduce code execution on the same host until the rest of the app is
  stable and the isolation story is stronger.

## Phase 0 — Host-fit infrastructure baseline

**Goal:** make the existing scaffold safe and usable on this specific server.

### What Phase 0 must deliver

- The stack can be started without colliding with existing services.
- The repo documents two deployment modes:
  - `fresh-host`: bootstrap and own the edge
  - `live-host`: coexist with existing Docker workloads
- GPU access for Ollama is verified without changing host-wide Docker behavior
  unless required.
- The web service is still allowed to be a placeholder, but the deployment path
  must be production-safe.

### Required changes

- Split the current compose setup into deployment modes.
  - `fresh-host` can keep public `80/443` Caddy ownership.
  - `live-host` should avoid claiming ports already used or reserved by other
    projects.
- Remove host port bindings for Postgres, Redis, and Ollama by default.
  - These services should be reachable over the Docker network.
  - Add optional localhost bindings only when explicitly enabled for admin use.
- Parameterize host ports instead of hardcoding them.
  - This matters immediately because `5432` is already taken on this machine.
- Treat `scripts/bootstrap-server.sh` as a new-machine script only.
  - Do not recommend running it on a live host that already has Docker and
    NVIDIA configured.
- Add a short preflight checklist for live-host installs:
  - inspect running containers
  - inspect occupied ports
  - choose ingress mode
  - choose compose project name
  - verify GPU container access

### Exit criteria

- `docker compose config` is valid for both deployment modes.
- The stack starts on this machine without port collisions.
- `docker run --rm --gpus all ... nvidia-smi` passes.
- The placeholder is reachable through the chosen ingress path.

## Phase 1 — Real app foundation

**Goal:** replace the placeholder with the actual web app and data layer.

### Scope

- Scaffold `apps/web` as the real application.
- Use Next.js App Router with TypeScript.
- Add Drizzle, migrations, and a small shared package in `packages/shared`.
- Keep the existing compose stack and swap `apps/web-placeholder` for `apps/web`
  once the app has a healthcheck endpoint.

### Why this phase stays close to the current repo

- Reuses the current compose wiring and healthcheck model.
- Reuses Postgres, Redis, Ollama, and ingress without changing the stack shape.
- Keeps the repository layout already established by the Phase 0 scaffold.

### Exit criteria

- `apps/web` builds in Docker.
- `/healthz` is served by the real app.
- Database migrations run cleanly against the compose Postgres service.

## Phase 2 — Auth, invitations, and minimum hardening

**Goal:** make the app private before any serious AI features ship.

### Scope

- Auth.js with email/password credentials.
- Invite-only registration flow.
- Admin bootstrap flow.
- `/admin` for invite and user management.
- Basic hardening now, not later:
  - rate limiting on `/login` and invite acceptance
  - audit logging for invite creation, acceptance, and role changes
  - structured request logging

### Why this moved earlier

The original plan delayed important controls too long. For an invite-only app,
privacy and abuse controls belong near the start.

### Exit criteria

- Admin can create an invite.
- Invited user can register and log in.
- Unauthenticated users cannot reach the app.
- Admin-only routes enforce role checks.

## Phase 3 — First useful chat on the local model

**Goal:** deliver a fast, private, authenticated chat experience with the local
model before introducing agent complexity.

### Scope

- Streaming chat against Ollama.
- Conversation and message persistence.
- Conversation list and basic chat UI.
- Context truncation and summarization policy from day one.

### Model guidance for this host

Given the `RTX 2060 SUPER` with `8 GiB` VRAM:

- Keep one main chat model hot.
- Do not assume multiple simultaneously loaded chat models.
- Keep Ollama concurrency conservative.
- Avoid building the UX around parallel tool-heavy runs.

### Exit criteria

- Authenticated users can hold a streaming conversation.
- History survives reloads.
- Failure handling is graceful when Ollama errors or times out.

## Phase 4 — Mediator, but intentionally narrow

**Goal:** add orchestration without pretending a small local model is a full
autonomous planner.

### Design constraints

- The local model is a router and conversation engine first.
- Use deterministic application logic wherever possible.
- Reserve LLM routing for ambiguous cases, not every turn.

### Recommended architecture

- A small provider layer that supports:
  - local Ollama
  - optional remote providers when a user key exists
- A run model with persisted state:
  - `conversation`
  - `run`
  - `tool_call`
  - `tool_result`
- A mediator that decides among:
  - answer directly
  - use an allowed tool
  - escalate to a remote provider

### Anti-goals

- No "multi-agent" theater built from prompt labels alone.
- No long-running autonomous background tasks yet.
- No tool access without permission checks and logging.

### Exit criteria

- Simple chat stays local.
- A tool-eligible request can route through a logged run record.
- Every route decision and tool invocation is visible in the admin logs.

## Phase 5 — First safe tool: retrieval, not code execution

**Goal:** prove the tool path using low-risk retrieval before adding dangerous
capabilities.

### Scope

- Document upload and parsing.
- Embeddings and retrieval using pgvector.
- `search_docs` as the first real tool.
- UI that clearly shows when retrieval was used.

### Why retrieval comes before web search or code execution

- It is safer.
- It improves product value quickly.
- It exercises the same orchestration primitives without creating a host escape
  risk.

### Exit criteria

- Upload a document.
- Ask a question from it.
- Get a cited answer with retrieved sources.

## Phase 6 — Remote model fallback with user-owned keys

**Goal:** allow higher-quality remote reasoning when the user provides a key.

### Scope

- Encrypted per-user API keys.
- A settings page to manage keys.
- Routing rules that prefer local by default and remote only when justified.
- Cost tracking per conversation.

### Guidance

- Treat remote models as an explicit capability, not a hidden fallback.
- Make model choice visible in the UI.
- Never log decrypted keys.

### Exit criteria

- User can add a provider key.
- A request can route to the remote provider when configured.
- The UI makes it clear which provider answered.

## Phase 7 — Web search and controlled external actions

**Goal:** extend the orchestrator carefully after the local and retrieval flows
are stable.

### Scope

- Add web search as a tool.
- Add per-tool allowlists by role or user.
- Add clear tool audit trails in the admin UI.

### Guidance

- External network tools are a separate trust boundary.
- Search results and citations should be shown explicitly.
- Do not combine search, remote escalation, and autonomous follow-up loops until
  the logs show the simpler flows are stable.

### Exit criteria

- Search-capable queries use the tool.
- Non-search queries stay direct.
- Tool use is logged and inspectable.

## Phase 8 — Stronger operations baseline

**Goal:** move from "works for me" to a service you can run confidently.

### Scope

- Structured logging with request and run IDs.
- Metrics for latency, tool use, error rates, and queue depth.
- Backup and restore automation.
- Error reporting.
- Feature flags for major tools and provider routing.
- Runbook for upgrades, key rotation, model pulls, and disk pressure.

### Exit criteria

- Restore drill succeeds.
- Service survives a restart cleanly.
- Operational visibility is good enough to debug failed runs quickly.

## Deferred phase — Code execution sandbox

**Goal:** only add code execution when the isolation story is strong enough.

This phase is intentionally deferred until after the main app is stable.

### Hard rule

Do not run a Docker-socket-backed execution service on the same host as the
main app unless you explicitly accept the blast radius.

### Safer options

- separate VM or bare-metal worker
- microVM isolation
- a dedicated execution host

### If this phase is ever started

- It needs its own threat model.
- It needs destructive test cases.
- It should be treated as a separate deployment concern, not just another tool.

## Cross-cutting work that should not wait until the end

- Tests for auth, invite flow, and chat persistence
- Run-state tests for mediator routing
- Feature flags for tools and providers
- Basic observability from the first real app release
- Explicit permission checks for any tool that touches the network or secrets

## Revised order for this repo

1. Make the current Phase 0 stack safe for this host.
2. Replace the placeholder with the real app shell.
3. Ship invite-only auth and minimum hardening.
4. Ship local chat.
5. Add persisted mediator runs.
6. Add document retrieval.
7. Add remote provider fallback.
8. Add web search and other controlled tools.
9. Revisit code execution only if it is still worth the risk.

## What success looks like

The repo should evolve from "GPU-ready placeholder stack" into a private AI app
without throwing away the infrastructure work already done.

If a future change does not respect the live-host constraint, the 8 GiB GPU
constraint, or the need for explicit tool permissions, it is probably the wrong
change for this project.
