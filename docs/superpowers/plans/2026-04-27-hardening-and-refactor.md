---
date: 2026-04-27
type: plan
title: Hardening, Refactor, and Algorithm Quality
status: active
---

# Hardening, Refactor, and Algorithm Quality Plan

This document captures the findings from a full codebase audit performed on
2026-04-27, combined with an analysis of pending uncommitted changes on `main`
and the already-merged `feature/phase7-web-search` branch. It translates those
findings into an actionable, tiered remediation plan.

---

## Context

### What is merged and stable

All feature/phase7-web-search work is squash-merged into `main` as commit
`8884471 Implement script routing, search, and ops hardening`. That includes:

- Tavily web search tool
- Per-user `search_enabled` toggle (`/admin/users`)
- `toolsUsed` column on `runs`
- `tools` array on `ChatDecision`
- `SCRIPT_ROUTING_ENABLED` feature flag

The `phase2-auth` branch is a historical pointer behind `main`; no work is
pending there.

### What is uncommitted on `main`

Two files are modified but not staged. Two test files are untracked.

**`apps/web/lib/db/index.ts` — lazy initialisation refactor**

The existing module eagerly creates a `postgres()` connection at import time.
If `DATABASE_URL` is malformed, importing any module that transitively uses
`lib/db` causes a module-load crash before the app can even start. The
pending change converts this to a lazy init: `initializeDb()` is called on
first use, and a separate `initError` is surfaced with a descriptive message.

Verdict: correct fix, well-tested, ready to commit.

**`apps/web/middleware.ts` — explicit route matcher**

The existing negative-lookahead regex
`/((?!_next/static|_next/image|favicon\.ico|healthz|login(?:$\\/)|accept(?:$\\/)).*)` 
is hard to reason about (any new public route must be remembered and added to
the exclusion list). The pending change replaces it with an explicit allowlist:

```
/dashboard/:path*
/settings/:path*
/admin/:path*
/api/chat/:path*
/api/conversations/:path*
/api/auth/step-up/:path*
```

Security improvement: new public endpoints are safe by default; new protected
endpoints must be explicitly added. The companion test in
`__tests__/middleware-config.test.ts` locks the list and will fail if a
protected route is accidentally dropped.

Verdict: correct direction, commit alongside the test.

---

## Tier 1 — Security / Correctness (do immediately)

These issues have direct security or data-correctness consequences.

### T1-1: Apply rate limiting to `/api/chat`

**Problem.** `lib/rate-limit.ts` is implemented and tested but is never called
in `app/api/chat/route.ts`. Any authenticated user can spam the endpoint
without restriction, triggering Ollama calls, Tavily calls, OpenAI API calls,
and shell script executions.

**Fix.** Add a per-user rate limit check immediately after `resolveSession`
and a tighter, separate limit for the `script` route:

```ts
// after resolveSession()
const rl = await checkRateLimit(`chat:${session.user.id}`, 30, 60_000);
if (!rl.allowed) {
  return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
}

// inside the script execution branch
const scriptRl = await checkRateLimit(`chat:script:${session.user.id}`, 5, 60_000);
if (!scriptRl.allowed) {
  return Response.json({ error: "Script rate limit exceeded." }, { status: 429 });
}
```

Apply the same pattern to `/api/auth/step-up/route.ts` if that endpoint is
not already rate-limited.

---

### T1-2: Fix TOCTOU race condition in rate limiter

**Problem.** `lib/rate-limit.ts` runs `ZREMRANGEBYSCORE`, then `ZCARD`, then
`ZADD` as three separate Redis commands. Under concurrent load, multiple
requests can all pass the `count < limit` check before any of them adds an
entry, allowing up to N simultaneous requests to slip through.

**Fix.** Replace the three commands with a single atomic Lua script evaluated
via `redis.eval()`:

```lua
local key = KEYS[1]
local now  = tonumber(ARGV[1])
local win  = tonumber(ARGV[2])
local lim  = tonumber(ARGV[3])
local mbr  = ARGV[4]
local ttl  = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, 0, win)
local cnt = redis.call('ZCARD', key)
if cnt >= lim then return 0 end
redis.call('ZADD', key, now, mbr)
redis.call('PEXPIRE', key, ttl)
return 1
```

`checkRateLimit` calls `redis.eval(script, 1, redisKey, now, windowStart, limit, member, windowMs)`
and interprets the return value.

---

### T1-3: Add error handler to Redis singleton

**Problem.** `lib/redis.ts` creates an ioredis `Redis` instance with no
`error` listener. An unhandled `error` event on a Node.js `EventEmitter`
throws an uncaught exception and kills the process. If Redis drops the
connection and emits an error event, the Next.js server dies.

**Fix.** One line after construction:

```ts
client = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
client.on("error", (err) =>
  logger.error("redis connection error", { error: err.message }),
);
```

---

### T1-4: Isolate script execution environment

**Problem.** `execFile` in `lib/scripts.ts` inherits the full `process.env`
of the Next.js server. This includes `AUTH_SECRET`, `USER_KEY_ENCRYPTION_KEY`,
`DATABASE_URL`, and `REDIS_URL`. An admin with script-creation access can
trivially dump all secrets:

```json
{ "command": "/usr/bin/env", "argvTemplate": [] }
```

Even with `requiresStepUp = true`, this is a risk if the admin role is ever
shared with a less-trusted operator.

**Fix.** Pass an explicit, minimal environment to `execFile`. If scripts
legitimately need specific values, add an `allowedEnvKeys: string[]` column
to the `scripts` table and resolve only those.

```ts
execFile(resolvedCommand, resolvedArgv, {
  timeout: 10_000,
  maxBuffer: 1024 * 1024,
  env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
}, ...);
```

**Migration needed**: add `allowed_env_keys jsonb` to `scripts` table (nullable,
defaults to null = no env passthrough). Admin UI should expose a managed list.

---

### T1-5: Fix `requireAdmin` to redirect instead of returning null

**Problem.** `lib/auth.ts` returns `null` for non-admin callers instead of
redirecting. Every server action under `app/(app)/admin/*/actions.ts` must
manually check for null. Any call site that forgets that check silently allows
non-admin access.

The admin layout does redirect on null, which means layout-level access is
safe. But server actions are invoked directly and do not go through the layout;
each one re-checks independently. A newly added server action that omits the
null check would be a silent privilege escalation.

**Fix.** Make `requireAdmin` consistent with `requireSession` — redirect
rather than return null:

```ts
export async function requireAdmin() {
  const { user, session } = await requireSession();
  if (user.role !== "admin") redirect("/dashboard");
  return { user, session };
}
```

Update all callers in admin actions to remove the now-unnecessary null checks.

---

## Tier 2 — Architecture / Maintainability

These issues do not have immediate security consequences but create the surface
area for future bugs and make the codebase significantly harder to change.

### T2-1: Break up the chat route God Function

**Problem.** `app/api/chat/route.ts` is 645 lines handling three completely
different execution paths (local Ollama streaming, OpenAI SSE streaming, and
shell script execution) in a single `POST` handler. Each path has its own
stream scaffolding, its own `finishRun` calls, and its own error recovery.
Changes to one path routinely force re-reading all three.

**Fix.** Extract three focused handler modules:

```
apps/web/lib/chat-handlers/
  execute-script.ts     — handles route === "script"
  stream-local.ts       — handles route === "chat" (Ollama)
  stream-remote.ts      — handles route === "escalate" (OpenAI)
  types.ts              — shared ChatHandlerContext type
```

The route becomes a thin dispatcher:

```ts
export async function POST(request: Request) {
  // auth, parse, classify, create pending turn …
  const ctx = buildContext(session, prepared, decision, citations, run, startMs);
  if (decision.route === "script")   return executeScriptHandler(ctx);
  if (decision.route === "escalate") return streamRemoteHandler(ctx);
  return streamLocalHandler(ctx);
}
```

Each handler owns its `saveAssistantReply`, `finishRun`, and stream
construction. This also makes it straightforward to unit-test each path in
isolation.

---

### T2-2: Unify the mediator behind a single async entry point

**Problem.** The routing decision is split across two functions and wired
together by a conditional IIFE in the route (lines 74–96 of `route.ts`).
`classifyChatPrompt` (synchronous regex) and `classifyScriptIntent` (async
Ollama LLM call) are separate; the logic for when to call the second is in
the route, not the mediator. This means the routing algorithm cannot be tested
as a whole.

Additionally, `classifyScriptIntent` adds a full Ollama round-trip to every
non-search chat message before the actual LLM call starts. On this hardware
(single hot model), this doubles the latency for the common path.

**Fix.** Expose a single async function:

```ts
// lib/mediator.ts
export async function routeRequest(
  prompt: string,
  opts: {
    scripts: ScriptRow[];
    model?: string;
    forceEscalate?: boolean;
    ollamaBaseUrl?: string;
  },
): Promise<ChatDecision>
```

Internal implementation:

1. Run `classifyChatPrompt` synchronously (regex, zero cost).
2. If result is `search` or `escalate`, return immediately — no LLM call.
3. If result is plain `chat` and `scripts.length > 0`, run
   `classifyScriptIntent` with a 3-second timeout. On timeout or error,
   return `chat` fallback.

The 3-second timeout prevents the classifier from blocking the chat path when
Ollama is under load or cold. Use `Promise.race`:

```ts
const decision = await Promise.race([
  classifyScriptIntent(prompt, scripts, model, opts),
  new Promise<ChatDecision>((resolve) =>
    setTimeout(() => resolve(chatFallback), 3000),
  ),
]);
```

The route then calls `routeRequest` once and has a single `ChatDecision`.

---

### T2-3: Paginate `listConversationsForUser`

**Problem.** `lib/chat.ts` loads all conversations for a user with no limit.
A user with thousands of conversations loads all their titles on every
dashboard render.

**Fix.**

```ts
export async function listConversationsForUser(
  userId: string,
  limit = 50,
  before?: Date,
): Promise<ConversationRow[]> {
  return db.query.conversations.findMany({
    where: before
      ? and(eq(conversations.userId, userId), lt(conversations.updatedAt, before))
      : eq(conversations.userId, userId),
    orderBy: [desc(conversations.updatedAt)],
    limit,
  });
}
```

The UI can load-more with a cursor. For now, applying a default hard cap of 50
is enough to prevent unbounded queries.

---

### T2-4: Add LLM stream timeout

**Problem.** `startLocalChatStream` and `startOpenAIResponsesStream` have no
timeout. If Ollama hangs mid-stream, the `ReadableStream` reader loop blocks
indefinitely. `executeScript` correctly has a 10-second timeout; the LLM
paths do not.

**Fix.** Wrap each reader loop with an `AbortController`:

```ts
const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(), 60_000);
// pass signal to fetch:
return fetch(url, { ..., signal: abort.signal });
// clear on stream end:
finally { clearTimeout(timeout); }
```

60 seconds is a reasonable ceiling for a 7B model on this GPU. Expose the
value as `OLLAMA_STREAM_TIMEOUT_MS` env var.

---

### T2-5: Resolve double DB query per authenticated request

**Problem.** `resolveSession` makes two DB queries on every request: one for
`sessions` and one for `users`. The user record is needed for `searchEnabled`
and `role` fields that change rarely.

**Fix.** Add a request-scoped user cache using Next.js `unstable_cache` or a
simple module-level LRU. At minimum, extend the iron-session cookie to include
`searchEnabled` so the `users` query can be deferred to cases where the value
is actually stale. Update `createSession` and any code path that changes
`searchEnabled` to invalidate or re-stamp the cookie.

For now, the low-risk first step is to add `searchEnabled: boolean` to
`SessionData` in `lib/session.ts`, write it during `createSession`, and read
it from the cookie in the chat route instead of from the user record. The full
user record is still fetched for admin operations where freshness matters.

---

## Tier 3 — Algorithm Quality

These affect correctness and performance of core features but are lower
urgency than the tiers above.

### T3-1: Replace word-based chunking with paragraph-aware chunking

**Problem.** `splitDocumentIntoChunks` splits purely on `\s+` words, cutting
mid-sentence. Chunks that start or end mid-sentence produce embeddings that
are less representative of the topic, hurting retrieval relevance.

**Fix.** Two-level splitting:

1. Split on `\n\n` (paragraph boundaries).
2. Accumulate paragraphs until the word budget (220 words) is reached.
3. When the next paragraph would overflow, flush the buffer as a chunk and
   start fresh.
4. For oversized single paragraphs (> 220 words), split at sentence boundaries
   using `/(?<=[.!?])\s+/` as a fallback.
5. Apply the existing 40-word overlap at the boundary between adjacent chunks,
   taking the last 40 words of the previous chunk as a prefix.

No new dependencies. `splitDocumentIntoChunks` has good test coverage; extend
the tests with structured documents (headings, bullet lists, code blocks) to
lock the new behaviour.

---

### T3-2: Move similarity threshold filter into SQL

**Problem.** `searchDocs` in `lib/retrieval.ts` fetches `limit` rows and then
filters in JavaScript:

```ts
.filter((row) => Number.isFinite(row.score) && row.score > 0)
```

Negative cosine similarity means near-orthogonal vectors (unrelated content).
These rows travel from Postgres to Node only to be discarded. The embedding
literal is also serialised twice (`vectorLiteral(queryEmbedding)` appears
twice in the same `sql` template).

**Fix.** Use a CTE to compute the query vector once and add a `WHERE` clause:

```sql
WITH q AS (SELECT ${vectorLiteral(queryEmbedding)}::vector AS vec)
SELECT
  dc.id                                    AS "chunkId",
  dc.document_id                           AS "documentId",
  d.title                                  AS "documentTitle",
  dc.chunk_index                           AS "chunkIndex",
  dc.content                               AS "content",
  1 - (dc.embedding <=> q.vec)             AS "score"
FROM document_chunks dc
CROSS JOIN q
INNER JOIN documents d ON d.id = dc.document_id
WHERE 1 - (dc.embedding <=> q.vec) > 0.1
ORDER BY dc.embedding <=> q.vec
LIMIT ${limit}
```

The threshold `0.1` (tunable) prevents returning chunks with essentially no
topical relationship to the query.

---

### T3-3: Replace hand-rolled OpenAI SSE parser

**Problem.** The SSE parser in `stream-remote.ts` (after T2-1 refactor) is
~120 lines of manual `buffer`, `eventName`, `dataLines` state management. SSE
has edge cases (partial reads, CRLF, multi-line `data:`, `id:` fields) that
the hand-rolled version handles only partially.

**Fix.** Use `eventsource-parser` (npm, zero runtime deps, 2 kB):

```ts
import { createParser, type ParsedEvent } from "eventsource-parser";

const parser = createParser((event: ParsedEvent) => {
  if (event.type !== "event") return;
  if (!event.data || event.data === "[DONE]") return;
  // … existing payload dispatch …
});

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  parser.feed(decoder.decode(value, { stream: true }));
}
```

This reduces the OpenAI handler by ~100 lines and eliminates the `eventName`
reset bug (where `eventName` is cleared inside `consumeEvent` but the outer
loop can still receive `event:` lines for the same multi-line event).

---

### T3-4: Validate embedding dimensions at startup

**Problem.** `documentChunks.embedding` is `vector(768)`. If `OLLAMA_EMBED_MODEL`
is changed to a model that produces different-dimension vectors (e.g.,
`mxbai-embed-large` produces 1024-d), all inserts and similarity queries fail
with a Postgres dimension-mismatch error. There is no startup check.

**Fix.** Add a constant and an instrumentation-time check:

```ts
// lib/retrieval.ts
export const EMBEDDING_DIMENSIONS = 768; // must match nomic-embed-text
```

In `instrumentation-node.ts`, after DB is ready, embed a single test string
and assert `result[0].length === EMBEDDING_DIMENSIONS`. Fail the startup with
a clear error message if the check fails. This surfaces misconfiguration before
any user request is affected.

---

### T3-5: Consolidate the `excerpt` utility

**Problem.** The same function:

```ts
function excerpt(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
```

exists verbatim in both `lib/runs.ts` and `lib/search.ts`.

**Fix.** Extract to `lib/utils.ts`. No behaviour change.

---

### T3-6: Cache `LOG_LEVEL` in logger

**Problem.** `lib/logger.ts` calls `activeLevel()` on every `emit()` call,
which re-reads and parses `process.env.LOG_LEVEL` each time.

**Fix.** Resolve the level once at module load:

```ts
const ACTIVE_LEVEL =
  LEVELS[(process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel] ??
  LEVELS.info;
```

---

### T3-7: Expand the OpenAI cost table and log missing estimates

**Problem.** `lib/remote-cost.ts` only has a price entry for `gpt-5-mini`.
Any other model (e.g., `gpt-4o`, `gpt-4.1`) returns `null`. The fallback
default model in `route.ts` is `"gpt-5-mini"`, but users can configure any
model string. When a model is not in the table, cost is silently `null` with
no log entry.

**Fix.** Add current model prices to the table. When `estimateOpenAICostUsd`
returns null, emit a `logger.warn` with the unknown model name so it is
visible in ops logs. Consider making the price table configurable via
environment variables as a fallback for new models.

---

## Phased execution order

### Immediate (before next deploy)

1. Commit the pending `lib/db/index.ts` lazy-init and `middleware.ts` explicit
   matcher with their companion tests. These are already written and correct.
2. T1-3: Add Redis error handler. One line, no migration.
3. T1-5: Fix `requireAdmin` to redirect. Low blast-radius, easy audit.
4. T3-5: Extract `excerpt` to `lib/utils.ts`. Mechanical, no logic change.
5. T3-6: Cache `LOG_LEVEL`. Mechanical.

### Sprint 1 — Security and correctness

6. T1-1: Wire rate limiting into `/api/chat`.
7. T1-2: Fix rate limit TOCTOU with Lua script.
8. T1-4: Isolate script execution env (minimal env object; defer the
   `allowed_env_keys` column to Sprint 2 if needed).
9. T2-4: Add LLM stream timeout via `AbortController`.

### Sprint 2 — Architecture

10. T2-1: Extract the three chat handler modules. Start with `execute-script`
    (simplest, no stream) to establish the context type, then `stream-local`,
    then `stream-remote`.
11. T2-2: Unify mediator behind `routeRequest` with a 3-second script
    classifier timeout. Update tests.
12. T2-3: Paginate `listConversationsForUser`.
13. T2-5: Add `searchEnabled` to `SessionData` to eliminate the second DB
    query per request.

### Sprint 3 — Algorithm quality

14. T3-3: Replace hand-rolled SSE parser with `eventsource-parser`.
15. T3-1: Improve document chunking with paragraph-aware splitting.
16. T3-2: Add SQL-side score threshold to `searchDocs`.
17. T3-4: Add embedding dimension validation at startup.
18. T3-7: Expand cost table and log missing model estimates.

---

## Migration checklist

| Issue | DB migration needed? |
|-------|----------------------|
| T1-4 (script env isolation) | Yes — `scripts.allowed_env_keys jsonb` (optional, Sprint 2) |
| T2-3 (pagination) | No |
| T2-5 (session cookie expansion) | No (iron-session is schema-free) |
| T3-1 (chunking) | No (re-chunk on next document upload) |
| T3-4 (embedding dimension check) | No |
| All others | No |

---

## What is explicitly out of scope for this plan

- Changing the local model or Ollama concurrency settings.
- Adding new user-facing features.
- Code execution sandboxing (deferred in `docs/implementation-plan.md`).
- Frontend component refactoring.
