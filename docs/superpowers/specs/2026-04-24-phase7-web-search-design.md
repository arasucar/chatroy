# Phase 7 — Web Search Tool Design

**Project:** Roy (Project 2, Phase 7)
**Date:** 2026-04-24
**Status:** Approved

## Scope

Add Tavily web search as the first controlled external tool. Extend the
mediator so search-intent queries route through the search tool and are
answered locally instead of escalating to a remote provider. Add per-user
search access control managed by admins. Log tool use in the existing runs
table.

This is the last phase of Project 2. Project 3 scope (scripts, third
classifier route, step-up auth) is explicitly out of scope here.

## Constraints carried in from prior phases

- Mediator discriminated union stays `chat | escalate` — no third route.
- Classifier must remain deterministic (no LLM call for routing).
- External tool access requires explicit permission checks and logging.
- Do not combine search + remote escalation on the same turn.
- 8 GiB VRAM budget is unaffected (search is network I/O, not GPU).
- Live-host safety: adding `TAVILY_API_KEY` to compose env is the only
  infrastructure change.

## Architecture

### Classifier extension (`lib/mediator.ts`)

Extend `ChatDecision` to carry an optional tools array on the `chat` route:

```typescript
type ChatDecision =
  | { route: "chat"; tools: ("search")[]; provider: "local"; model: string; reason: string }
  | { route: "escalate"; tools: []; provider: "remote"; model: null; reason: string }
```

The discriminated union remains two variants. `tools` is always an empty
array on `escalate`. On `chat` it is either `[]` (plain local) or
`["search"]` (local with search tool).

**Classifier logic change:** The existing `REMOTE_CAPABILITY_RULES` patterns
(time-sensitive, live data, explicit search requests) currently return
`escalate`. They will instead return `{ route: "chat", tools: ["search"] }`
— the query stays local, answered with Tavily context injected. The `escalate`
fallback is preserved for users without search access: if the user's
`searchEnabled` flag is false, the API re-classifies to `escalate` at
request time.

### Search tool (`lib/search.ts`)

New file. Single responsibility: call Tavily, return structured citations.

```typescript
export async function webSearch(query: string, limit?: number): Promise<MessageCitation[]>
```

Tavily endpoint: `POST https://api.tavily.com/search`
- Request: `{ api_key, query, max_results: limit, search_depth: "basic" }`
- Response: `{ results: [{ title, url, content, score }] }`

Each result maps to a `MessageCitation`:
- `source: "search"`
- `url`: the page URL
- `documentTitle`: page title
- `documentId`: URL (stable display key, not a DB reference)
- `chunkId`: URL
- `chunkIndex`: result position
- `excerpt`: content snippet (truncated to 240 chars)
- `score`: Tavily relevance score

Results are ephemeral — not stored in a separate table. They are persisted
only in the `messages.citations` jsonb column alongside the assistant reply,
same as retrieval citations.

**Error handling:** Any fetch error, non-2xx status, or empty result array
returns `[]` and logs the error. The turn continues without search context.
No hard failure is surfaced to the user.

### `MessageCitation` extension (`lib/db/schema.ts`)

Add two optional fields to the existing `MessageCitation` type:

```typescript
type MessageCitation = {
  // existing fields
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
  // new fields
  source?: "retrieval" | "search";
  url?: string;
};
```

Existing retrieval citations are unaffected (both new fields default to
absent). Search citations populate `source: "search"` and `url`.

### API route changes (`app/api/chat/route.ts`)

After `classifyChatPrompt` and run creation, before building provider
messages:

1. If `decision.tools.includes("search")`:
   - Fetch `user.searchEnabled` from DB.
   - If `searchEnabled` and `TAVILY_API_KEY` is set: call `webSearch(prompt)`,
     append results to `citations` (after any retrieval results).
   - Otherwise: re-classify as `escalate` and follow the existing escalation
     path (no search context injected). This means: use OpenAI if the user
     has a key, show the "add a key in Settings" blocked message if not.
2. `toolsUsed` is collected as a string array and written to `runs.toolsUsed`
   on run completion.

Search and retrieval can both be active on the same turn. Results are
concatenated and numbered sequentially in the system prompt. The combined
list must not exceed ~8 results total to keep context size reasonable; apply
retrieval limit 4 + search limit 4 as today.

### Schema migrations (`drizzle/`)

One new migration (0006) covering:

1. `users.search_enabled boolean not null default true` — all existing users
   get search access when `TAVILY_API_KEY` is configured.
2. `runs.tools_used jsonb` — nullable, stores `["search"]`, `["retrieval"]`,
   `["search","retrieval"]`, or null for plain chat turns.

### Per-user allowlist

`users.searchEnabled` is the allowlist. Admin-controlled only — users cannot
toggle their own search access. Default `true` so the feature is available
immediately on deploy without admin action.

Access logic: `TAVILY_API_KEY` must be set server-side AND
`user.searchEnabled` must be `true`. Either missing → search unavailable →
fall back to escalate for search-intent queries.

## Components

| File | Change |
|---|---|
| `lib/search.ts` | New — Tavily client |
| `lib/mediator.ts` | Extend `ChatDecision` type, add `tools` to classifier output |
| `lib/db/schema.ts` | Extend `MessageCitation`, add `searchEnabled` to users, `toolsUsed` to runs |
| `app/api/chat/route.ts` | Check search access, call search tool, pass `toolsUsed` to run |
| `app/(app)/admin/users/` | Add search toggle per user (server action + UI button) |
| `app/(app)/admin/runs/page.tsx` | Add Tools column showing `toolsUsed` per run |
| `app/(app)/dashboard/chat-workspace.tsx` | Render search citations with URL link + "Web" badge |
| `drizzle/0006_*.sql` | Migration: `users.search_enabled`, `runs.tools_used` |
| `.env.example` | Add `TAVILY_API_KEY` with comment |
| `docker-compose.yml` | Inject `TAVILY_API_KEY` into `web` service env |

## Data flow

```
User sends prompt
  → classifyChatPrompt(prompt)
      → "chat" + tools:[] → plain local chat (unchanged)
      → "chat" + tools:["search"]
            → user.searchEnabled && TAVILY_API_KEY?
                  yes → webSearch(prompt) → citations[]
                        → buildProviderMessages(thread, citations)
                        → local Ollama → stream reply
                        → saveAssistantReply(citations)
                        → finishRun(toolsUsed:["search"])
                  no  → re-classify escalate → existing escalation path
      → "escalate" → existing OpenAI path (unchanged)
```

## UI changes

**Citations panel** (existing): Search citations render the same numbered
format as retrieval. A small "Web" badge distinguishes them. The `url` field
renders as a plain link below the excerpt. No new panel needed.

**Chat toolbar**: No new toggle. Search is automatic per Approach B. The
`useRetrieval` toggle remains unchanged.

**Admin users page**: Search toggle button next to the existing role toggle.
Server action: `setUserSearchEnabled(userId, enabled)`. Same styling as
role toggle.

**Admin runs page**: New "Tools" column. Renders `search`, `retrieval`,
`search+retrieval`, or `—` based on `toolsUsed`.

## Testing

**`__tests__/mediator.test.ts`** — extend:
- Search-intent query + default model → `{ route: "chat", tools: ["search"] }`
- Plain query → `{ route: "chat", tools: [] }`
- Escalate result → `tools: []`

**`__tests__/search.test.ts`** — new:
- Mock fetch → Tavily-shaped response → assert correct `MessageCitation[]`
  output with `source: "search"` and `url` populated.
- Mock fetch → empty results → assert `[]` returned.
- Mock fetch → network error → assert `[]` returned (no throw).

No live Tavily integration test — unit mock at the fetch boundary is
sufficient.

## Exit criteria (from Phase 7)

- Search-capable queries use the tool and answers include web citations.
- Non-search queries stay on the direct local path.
- Tool use is logged in the runs table and visible at `/admin/runs`.

## What this is not

- No LLM-driven tool selection (classifier stays deterministic).
- No combining search + remote escalation on the same turn.
- No self-service search toggle for users (admin-controlled only).
- No Project 3 work: no script route, no user-authored tools, no step-up auth.
