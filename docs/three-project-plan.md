# Agent handoff — continue the three-project plan

## Current status on this repo

Validated on April 23, 2026:

- Project 1 is already working on this host in `live-host` mode.
  - `llm-hello` is reachable on `127.0.0.1:3005`.
  - The existing smoke test streamed a response end to end from
    `qwen2.5:7b-instruct-q4_K_M`.
- Project 2 has already started and is materially into Phase 2.
  - `apps/web` now contains the real Next.js app, invite-only auth flow, admin
  bootstrap, invite acceptance, role enforcement, audit logging, Redis rate
  limiting, authenticated local chat, a narrow mediator run log, cited
  document retrieval, encrypted user-owned OpenAI fallback, and controlled web
  search with per-user allowlists.
  - `npm test` passes with 33 tests.
  - `npm run build` passes after splitting Node-only bootstrap logic into
    `instrumentation-node.ts`, which avoids bundling the Postgres client into
    the edge instrumentation path.
- Project 3 script-routing slice is now implemented and deployed.
  - `apps/web` contains a `scripts` table, `/admin/scripts`, and parser
    helpers that keep scripts as data rows with argv templates and declared
    params.
  - Manual admin-triggered runs are recorded in `script_runs` with
    argv-only resolution and persisted stdout/stderr metadata.
  - The `script` classifier route is live: `ChatDecision` is a three-way
    discriminated union (`chat | escalate | script`).
  - `classifyScriptIntent()` calls the local Ollama model, selects a script
    only when intent is unambiguous, validates params against the schema, and
    falls back to `chat` on any ambiguity or error.
  - `/api/chat` handles the `script` route: executes the script, streams
    formatted output as the assistant reply, and records runs in both tables.
  - `npm test` passes with 46 tests.
- Project 3 sensitive-script step-up auth is now implemented.
  - Scripts can be marked `requiresStepUp`, which persists on the script row
    and is shown in the admin registry/detail views.
  - Manual admin-triggered runs require current-password confirmation for
    sensitive scripts.
  - AI-routed script execution now checks the recent-password window before
    creating a chat turn, so blocked sensitive runs do not leave orphaned
    conversation messages behind.
  - The chat workspace now shows an inline password confirmation panel and
    retries the blocked script prompt automatically after successful re-auth.
  - `npm test` passes with 53 tests.

As of this snapshot, Project 2 is complete and Project 3's core routing
slice is done. What remains for Project 3: deeper per-turn script metadata in
the chat history if you want richer retrospective inspection there, and the
remaining Phase 8 ops hardening work.

You are continuing work on an invite-only AI chatbot that will eventually grow
into a personal DevOps copilot. A prior iteration produced a three-project
split; a subsequent refinement made the plan host-aware and reordered some
phases. Your job is to reconcile these and move the work forward without
regressing either constraint set.

## What you are inheriting

### Two planning documents

1. **`three-project-plan.md`** — splits the work into three independent
   deliverables:
   - Project 1: Local LLM hello world on the server
   - Project 2: Invite-only chatbot with local + multi-provider remote LLMs
   - Project 3: User-defined scripts/actions, authored through a UI, executed
     by a runner, selected by the local LLM

2. **`implementation-plan-host-aware.md`** — a refinement that pivoted from
   "blank server" to "live Docker host" thinking. Key facts:
   - Ubuntu 24.04.4, Docker 29.3.1, Compose v5.1.1 already installed
   - NVIDIA Container Toolkit already working
   - RTX 2060 SUPER, 8 GiB VRAM
   - Existing Docker workloads on the host; **port 5432 already occupied**
   - Repo already contains: `docker-compose.yml`, `Caddyfile.fresh-host`,
     `apps/web-placeholder`, `scripts/bootstrap-server.sh`,
     `scripts/pull-models.sh`

### The reconciliation you must enforce

Both documents are correct. They describe the same product from different
angles. Your mental model should be:

- **The three-project split defines scope boundaries.** What ships at each
  stop-and-ship point. Which concerns belong where.
- **The host-aware plan defines execution constraints.** How to adopt the
  existing repo without breaking live services. Phase numbering inside that
  doc is about engineering order on *this specific machine*.

When they appear to conflict, the host-aware constraints win for near-term
sequencing (don't disturb the live host) and the three-project boundaries win
for scope (don't smuggle Project 3 work into Project 2).

Concrete mapping:

- Project 1 ≈ the Ollama service inside Phase 0 of the host-aware plan, plus a
  minimal inference wrapper that exists only to prove GPU-through-container
  works. This overlaps with existing repo assets — extend, don't replace.
- Project 2 ≈ host-aware Phases 1–4 and 6–7. Real web app, auth-first
  hardening, local chat, mediator with two routes (`chat | escalate`),
  multi-provider remote keys. **No scripts, no tools beyond retrieval.**
- Project 3 ≈ everything about user-defined scripts: authoring UI, runner
  service, classifier extension to a third route (`script`), step-up auth,
  audit of runs. Retrieval may land in Project 2 (as the host-aware plan
  suggests) or be deferred — use judgment based on user need at the time.

## Non-negotiable constraints

These are load-bearing. Do not relax them without explicit approval:

1. **Live-host safety.** This server runs other containers. Never restart
   Docker, never claim host ports already bound, never replace a
   Caddy/reverse-proxy that another project may be using. Every compose change
   must work in both `fresh-host` and `live-host` modes.

2. **Re-verify host state before acting.** The host facts above were captured
   on a specific date. Before making port/service decisions, run
   `docker ps`, `ss -tlnp`, `nvidia-smi` inside a GPU container, and check
   free disk. Don't trust stale notes.

3. **8 GiB VRAM is the VRAM budget.** Plan for one hot chat model, conservative
   Ollama concurrency, no multi-model parallelism. Current target model:
   `qwen2.5:7b-instruct-q4_K_M`. Embeddings model (when retrieval ships):
   `nomic-embed-text`. If a future change implies loading both at full
   concurrency, flag it.

4. **Auth before AI.** Invite-only registration, rate-limiting on
   `/login` and `/accept`, audit logging for auth events — all of this lands
   in Project 2 *before* the chat surface exposes the LLM. The host-aware
   plan is explicit about this and it is correct.

5. **Scripts are data, not code.** In Project 3, scripts are rows in a
   database with declared params, not hand-written TypeScript handlers. The
   classifier reads the script registry at call time and can only pick from
   it — the LLM never invents shell. Parameter substitution is **argv-only,
   never string interpolation**. Enum-typed params are the default in the
   authoring UI.

6. **Classifier routes stage by project.**
   - Project 2 classifier: `{ route: "chat" | "escalate", ... }` — two routes.
   - Project 3 classifier: `{ route: "chat" | "escalate" | "script", script: { name, params } | null, ... }` — three routes.
   Use a TypeScript discriminated union so adding the third variant is a
   one-file change. Do not preemptively add `"script"` in Project 2.

7. **Code execution is not on the roadmap.** The host-aware plan defers it; in
   combination with the user-defined-scripts architecture, it may never be
   needed. If the user later asks for arbitrary code execution, treat it as a
   separate proposal requiring its own threat model — do not quietly add it.

## How to work

### Before any code change

- Read both planning documents in full if you have not already.
- Confirm which project you are inside. State it explicitly at the start of
  the work ("this change is Project 2, Phase 2.3").
- If the change implies Project-3 shape in Project-2 code, stop and flag it.

### When the plan is ambiguous

- Prefer the smaller change. Both plans value incremental progress over
  rewrites.
- Prefer the existing repo asset. If `docker-compose.yml`,
  `apps/web-placeholder`, or `scripts/pull-models.sh` can be extended, do
  that instead of creating parallel files.
- Ask the user rather than guessing on anything that affects the live host:
  port bindings, ingress mode, Docker daemon config, model choice.

### When you finish a unit of work

- State the exit criterion from the relevant plan section and whether it is
  met.
- Flag any constraint you came close to violating (VRAM, port, live-host
  safety) and how you avoided it.
- Update the relevant plan document if reality diverged — keep the plan
  truthful, not aspirational.

## Starting task

Produce a concrete Project 1 deliverable on this specific host:

1. Re-verify host state (Docker version, GPU visibility inside a container,
   free ports, free disk).
2. Propose the minimal change-set on top of the existing repo to achieve
   Project 1's exit criterion: a network-reachable endpoint that streams a
   response from `qwen2.5:7b-instruct-q4_K_M` end-to-end, without colliding
   with any existing service on the host.
3. List what you will touch, what you will leave alone, and which
   `fresh-host` vs `live-host` assumptions you are making.
4. Stop before executing. Wait for approval.

Do not scaffold Project 2 work during Project 1. Do not add auth, a real web
app, a database migration system, or anything the Project 1 exit criterion
doesn't require.

## Tone

Concise. Technical. Assume the reader is the repo owner and has context.
Don't narrate obvious steps; do surface decisions and trade-offs. When you
are uncertain, say so and ask — this project has consequences on a machine
the user cares about.
