# Phase 7 — Web Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tavily web search as the first controlled external tool, routing search-intent queries through the search tool and answering locally instead of escalating.

**Architecture:** Extend the deterministic classifier to return `tools: ["search"]` for search-intent queries. A new `lib/search.ts` calls Tavily and returns `MessageCitation[]`. The API route checks `user.searchEnabled`, calls the search tool, injects results alongside retrieval citations, and logs tool use in `runs.toolsUsed`. Admin users page gains a per-user search toggle.

**Tech Stack:** Tavily REST API (fetch, no new package), Drizzle ORM, Next.js App Router, Vitest

---

## File Map

**Create:**
- `apps/web/lib/search.ts` — Tavily client, single export `webSearch(query, limit?) → MessageCitation[]`
- `apps/web/app/(app)/admin/users/search-toggle.tsx` — client component, search enable/disable button
- `apps/web/__tests__/search.test.ts` — unit tests for Tavily client

**Modify:**
- `apps/web/lib/db/schema.ts` — extend `MessageCitation` type; add `searchEnabled` to `users`; add `toolsUsed` to `runs`
- `apps/web/lib/mediator.ts` — extend `ChatDecision` union with `tools` array; update classifier
- `apps/web/lib/runs.ts` — add `toolsUsed?: string[]` to `finishRun` input
- `apps/web/app/api/chat/route.ts` — check search access, call `webSearch`, collect `toolsUsed`
- `apps/web/app/(app)/admin/users/actions.ts` — add `setSearchEnabledAction`
- `apps/web/app/(app)/admin/users/page.tsx` — add Search column + `SearchToggle`
- `apps/web/app/(app)/admin/runs/page.tsx` — add Tools column
- `apps/web/app/(app)/dashboard/chat-workspace.tsx` — extend local citation type; render search citations with URL + "Web" badge
- `apps/web/__tests__/mediator.test.ts` — add tools assertions
- `apps/web/__tests__/runs.test.ts` — add `tools: []` to decision fixtures
- `.env.example` — add `TAVILY_API_KEY`
- `docker-compose.yml` — inject `TAVILY_API_KEY` into `web` service env

**Generate:**
- `apps/web/drizzle/0006_*.sql` — drizzle-kit generates this from the schema change

---

### Task 1: Extend schema types and generate migration

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Generate: `apps/web/drizzle/0006_*.sql` + `apps/web/drizzle/meta/0006_snapshot.json`

- [ ] **Step 1: Add `boolean` to the drizzle import and extend the schema**

  In `apps/web/lib/db/schema.ts`, replace the import block at the top:

  ```typescript
  import {
    boolean,
    customType,
    doublePrecision,
    integer,
    index,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
  } from "drizzle-orm/pg-core";
  ```

- [ ] **Step 2: Extend `MessageCitation` type**

  Replace the existing `MessageCitation` type definition (around line 53):

  ```typescript
  export type MessageCitation = {
    documentId: string;
    documentTitle: string;
    chunkId: string;
    chunkIndex: number;
    excerpt: string;
    score: number;
    source?: "retrieval" | "search";
    url?: string;
  };
  ```

- [ ] **Step 3: Add `searchEnabled` to the `users` table**

  In the `users` table definition, add `searchEnabled` after the `role` field:

  ```typescript
  export const users = pgTable(
    "users",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      email: text("email").notNull(),
      passwordHash: text("password_hash"),
      displayName: text("display_name"),
      role: appRole("role").notNull().default("member"),
      searchEnabled: boolean("search_enabled").notNull().default(true),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
      emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
    }),
  );
  ```

- [ ] **Step 4: Add `toolsUsed` to the `runs` table**

  In the `runs` table definition, add `toolsUsed` after `estimatedCostUsd`:

  ```typescript
  estimatedCostUsd: doublePrecision("estimated_cost_usd"),
  toolsUsed: jsonb("tools_used").$type<string[] | null>(),
  ```

- [ ] **Step 5: Generate the migration**

  ```bash
  cd apps/web && npm run db:generate
  ```

  Expected: a new file `drizzle/0006_*.sql` appears. Verify it contains:
  ```sql
  ALTER TABLE "users" ADD COLUMN "search_enabled" boolean DEFAULT true NOT NULL;
  ALTER TABLE "runs" ADD COLUMN "tools_used" jsonb;
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/lib/db/schema.ts apps/web/drizzle/
  git commit -m "feat(schema): add users.search_enabled and runs.tools_used, extend MessageCitation"
  ```

---

### Task 2: Extend classifier and update tests

**Files:**
- Modify: `apps/web/lib/mediator.ts`
- Modify: `apps/web/__tests__/mediator.test.ts`
- Modify: `apps/web/__tests__/runs.test.ts`

- [ ] **Step 1: Write the failing tests**

  Replace the contents of `apps/web/__tests__/mediator.test.ts`:

  ```typescript
  import { describe, expect, it } from "vitest";
  import { classifyChatPrompt } from "../lib/mediator";

  describe("classifyChatPrompt", () => {
    it("keeps ordinary private prompts on the local chat path with no tools", () => {
      const result = classifyChatPrompt("Summarize this architecture decision in two bullets.");
      expect(result.route).toBe("chat");
      expect(result.provider).toBe("local");
      expect(result.tools).toEqual([]);
      expect(result.model).toBeTruthy();
    });

    it("routes search-intent prompts to chat with tools=[search]", () => {
      const result = classifyChatPrompt("What is the latest NVIDIA stock price today?");
      expect(result.route).toBe("chat");
      expect(result.provider).toBe("local");
      expect(result.tools).toEqual(["search"]);
    });

    it("routes news queries to chat with tools=[search]", () => {
      const result = classifyChatPrompt("What's in the news about TypeScript today?");
      expect(result.route).toBe("chat");
      expect(result.tools).toEqual(["search"]);
    });

    it("routes explicit search requests to chat with tools=[search]", () => {
      const result = classifyChatPrompt("Search the web for the best Postgres extensions.");
      expect(result.route).toBe("chat");
      expect(result.tools).toEqual(["search"]);
    });

    it("escalate result always has tools=[]", () => {
      const result = classifyChatPrompt(
        "Summarize this architecture decision in two bullets.",
        "qwen2.5:7b",
        { forceEscalate: true },
      );
      expect(result.route).toBe("escalate");
      expect(result.tools).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  cd apps/web && npm test -- mediator
  ```

  Expected: failures about `tools` property and `forceEscalate` option not existing.

- [ ] **Step 3: Rewrite `lib/mediator.ts`**

  Replace the entire file:

  ```typescript
  export type ChatDecision =
    | {
        route: "chat";
        tools: ("search")[];
        provider: "local";
        model: string;
        reason: string;
      }
    | {
        route: "escalate";
        tools: [];
        provider: "remote";
        model: null;
        reason: string;
      };

  const SEARCH_RULES: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /\b(latest|today|current|yesterday|tomorrow)\b/i,
      reason: "The request depends on time-sensitive information.",
    },
    {
      pattern: /\b(news|weather|forecast|stock|stocks|price|prices|crypto|score|scores)\b/i,
      reason: "The request points at live external data.",
    },
    {
      pattern: /\b(search|browse|google|web|internet|look up|lookup)\b/i,
      reason: "The request explicitly asks for external lookup capability.",
    },
  ];

  export function classifyChatPrompt(
    prompt: string,
    model = process.env.OLLAMA_CHAT_MODEL || "qwen2.5:7b-instruct-q4_K_M",
    options: { forceEscalate?: boolean } = {},
  ): ChatDecision {
    if (options.forceEscalate) {
      return {
        route: "escalate",
        tools: [],
        provider: "remote",
        model: null,
        reason: "Forced escalation.",
      };
    }

    for (const rule of SEARCH_RULES) {
      if (rule.pattern.test(prompt)) {
        return {
          route: "chat",
          tools: ["search"],
          provider: "local",
          model,
          reason: rule.reason,
        };
      }
    }

    return {
      route: "chat",
      tools: [],
      provider: "local",
      model,
      reason: "The request fits the local chat path.",
    };
  }
  ```

- [ ] **Step 4: Run mediator tests — expect pass**

  ```bash
  cd apps/web && npm test -- mediator
  ```

  Expected: all 5 tests pass.

- [ ] **Step 5: Fix `runs.test.ts` decision fixtures**

  The `runs.test.ts` creates `ChatDecision` objects without `tools`. Add `tools` to both fixtures:

  In `apps/web/__tests__/runs.test.ts`, update the `localRun` decision:
  ```typescript
  decision: {
    route: "chat",
    tools: [],
    provider: "local",
    model: "qwen2.5:7b-instruct-q4_K_M",
    reason: "The request fits the local chat path.",
  },
  ```

  And the `escalatedRun` decision:
  ```typescript
  decision: {
    route: "escalate",
    tools: [],
    provider: "remote",
    model: null,
    reason: "The request depends on time-sensitive information.",
  },
  ```

- [ ] **Step 6: Run all tests — expect pass**

  ```bash
  cd apps/web && npm test
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/mediator.ts apps/web/__tests__/mediator.test.ts apps/web/__tests__/runs.test.ts
  git commit -m "feat(mediator): add tools array to ChatDecision, route search-intent to chat+search"
  ```

---

### Task 3: Build search tool (TDD)

**Files:**
- Create: `apps/web/__tests__/search.test.ts`
- Create: `apps/web/lib/search.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/search.test.ts`:

  ```typescript
  import { afterEach, describe, expect, it, vi } from "vitest";
  import { webSearch } from "../lib/search";

  const TAVILY_API_KEY = "tvly-test-key";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("webSearch", () => {
    it("returns MessageCitation[] from a successful Tavily response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "TypeScript 5.8 Released",
              url: "https://example.com/ts58",
              content: "TypeScript 5.8 ships improved type narrowing.",
              score: 0.92,
            },
            {
              title: "What's new in TS 5.8",
              url: "https://example.com/whats-new",
              content: "A comprehensive look at the new features.",
              score: 0.85,
            },
          ],
        }),
      }));

      const results = await webSearch("TypeScript 5.8 release", 4, TAVILY_API_KEY);

      expect(results).toHaveLength(2);
      expect(results[0].source).toBe("search");
      expect(results[0].url).toBe("https://example.com/ts58");
      expect(results[0].documentTitle).toBe("TypeScript 5.8 Released");
      expect(results[0].excerpt).toBe("TypeScript 5.8 ships improved type narrowing.");
      expect(results[0].score).toBe(0.92);
      expect(results[0].chunkIndex).toBe(0);
      expect(results[1].chunkIndex).toBe(1);
    });

    it("returns [] when Tavily returns no results", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      }));

      const results = await webSearch("query with no results", 4, TAVILY_API_KEY);
      expect(results).toEqual([]);
    });

    it("returns [] and does not throw on network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

      const results = await webSearch("any query", 4, TAVILY_API_KEY);
      expect(results).toEqual([]);
    });

    it("returns [] on non-2xx Tavily response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limit exceeded" }),
      }));

      const results = await webSearch("any query", 4, TAVILY_API_KEY);
      expect(results).toEqual([]);
    });

    it("truncates excerpts longer than 240 characters", async () => {
      const longContent = "a".repeat(300);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { title: "Long result", url: "https://example.com", content: longContent, score: 0.9 },
          ],
        }),
      }));

      const results = await webSearch("query", 4, TAVILY_API_KEY);
      expect(results[0].excerpt.length).toBeLessThanOrEqual(240);
      expect(results[0].excerpt.endsWith("...")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  cd apps/web && npm test -- search
  ```

  Expected: FAIL — `webSearch` not found.

- [ ] **Step 3: Implement `lib/search.ts`**

  Create `apps/web/lib/search.ts`:

  ```typescript
  import type { MessageCitation } from "./db/schema";

  const TAVILY_URL = "https://api.tavily.com/search";

  function truncateExcerpt(content: string, maxLength = 240): string {
    if (content.length <= maxLength) return content;
    return `${content.slice(0, maxLength - 3).trimEnd()}...`;
  }

  export async function webSearch(
    query: string,
    limit = 4,
    apiKey = process.env.TAVILY_API_KEY ?? "",
  ): Promise<MessageCitation[]> {
    if (!apiKey) return [];

    try {
      const response = await fetch(TAVILY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
          search_depth: "basic",
        }),
      });

      if (!response.ok) return [];

      const payload = (await response.json()) as {
        results?: Array<{ title: string; url: string; content: string; score: number }>;
      };

      const results = payload.results ?? [];

      return results.map((result, index) => ({
        documentId: result.url,
        documentTitle: result.title,
        chunkId: result.url,
        chunkIndex: index,
        excerpt: truncateExcerpt(result.content),
        score: result.score,
        source: "search" as const,
        url: result.url,
      }));
    } catch {
      return [];
    }
  }
  ```

- [ ] **Step 4: Run search tests — expect pass**

  ```bash
  cd apps/web && npm test -- search
  ```

  Expected: all 5 tests pass.

- [ ] **Step 5: Run full test suite**

  ```bash
  cd apps/web && npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/lib/search.ts apps/web/__tests__/search.test.ts
  git commit -m "feat(search): add Tavily web search tool"
  ```

---

### Task 4: Update runs layer

**Files:**
- Modify: `apps/web/lib/runs.ts`

- [ ] **Step 1: Add `toolsUsed` to `finishRun`**

  In `apps/web/lib/runs.ts`, update the `finishRun` input type and DB call.

  Replace the `finishRun` function:

  ```typescript
  export async function finishRun(
    runId: string,
    input: {
      status: "completed" | "blocked" | "failed";
      response?: string | null;
      errorMessage?: string | null;
      providerResponseId?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      totalTokens?: number | null;
      estimatedCostUsd?: number | null;
      toolsUsed?: string[] | null;
    },
  ): Promise<void> {
    const db = requireDb();
    await db
      .update(runs)
      .set({
        status: input.status,
        responseExcerpt: input.response ? excerpt(input.response) : null,
        errorMessage: input.errorMessage ?? null,
        providerResponseId: input.providerResponseId ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        toolsUsed: input.toolsUsed ?? null,
        completedAt: new Date(),
      })
      .where(eq(runs.id, runId));
  }
  ```

- [ ] **Step 2: Run all tests — expect pass**

  ```bash
  cd apps/web && npm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/lib/runs.ts
  git commit -m "feat(runs): add toolsUsed to finishRun"
  ```

---

### Task 5: Wire search into the chat API route

**Files:**
- Modify: `apps/web/app/api/chat/route.ts`

- [ ] **Step 1: Update the imports**

  At the top of `apps/web/app/api/chat/route.ts`, add the search import:

  ```typescript
  import { webSearch } from "@/lib/search";
  ```

  The full import block becomes:

  ```typescript
  import { resolveSession } from "@/lib/auth";
  import { createPendingTurn, saveAssistantReply } from "@/lib/chat";
  import type { MessageCitation } from "@/lib/db/schema";
  import { classifyChatPrompt } from "@/lib/mediator";
  import { startLocalChatStream, startOpenAIResponsesStream } from "@/lib/provider";
  import { buildRetrievalSystemPrompt, searchDocs } from "@/lib/retrieval";
  import { estimateOpenAICostUsd } from "@/lib/remote-cost";
  import { createRun, finishRun } from "@/lib/runs";
  import { webSearch } from "@/lib/search";
  import { getDecryptedUserProviderKey } from "@/lib/user-provider-keys";
  ```

- [ ] **Step 2: Add the search block after retrieval in the POST handler**

  In the `POST` function, locate the retrieval block:

  ```typescript
  let citations: MessageCitation[] = [];
  if (payload.useRetrieval) {
    try {
      citations = await searchDocs(prompt);
    } catch {
      citations = [];
    }
  }
  ```

  Replace it with:

  ```typescript
  let citations: MessageCitation[] = [];
  if (payload.useRetrieval) {
    try {
      citations = await searchDocs(prompt);
    } catch {
      citations = [];
    }
  }

  const toolsUsed: string[] = [];

  if (decision.route === "chat" && decision.tools.includes("search")) {
    if (session.user.searchEnabled && process.env.TAVILY_API_KEY) {
      const searchResults = await webSearch(prompt);
      if (searchResults.length > 0) {
        citations = [...citations, ...searchResults];
        toolsUsed.push("search");
      }
    } else {
      // Search unavailable for this user — re-classify as escalate
      const escalateDecision = {
        route: "escalate" as const,
        tools: [] as [],
        provider: "remote" as const,
        model: null,
        reason: decision.reason,
      };
      Object.assign(decision, escalateDecision);
    }
  }

  if (payload.useRetrieval && citations.some((c) => c.source !== "search")) {
    toolsUsed.push("retrieval");
  }
  ```

  > Note: `Object.assign(decision, escalateDecision)` mutates the local `decision` variable so the route check below picks up the escalation path. `decision` is a `let`-like binding from `classifyChatPrompt` — if TypeScript complains, declare it with `let decision = classifyChatPrompt(prompt)` earlier in the function.

- [ ] **Step 3: Declare `decision` with `let` (if not already)**

  Near the top of the POST handler, ensure the classifier result uses `let`:

  ```typescript
  let decision = classifyChatPrompt(prompt);
  ```

  (If it was `const`, change it to `let`.)

- [ ] **Step 4: Pass `toolsUsed` to every `finishRun` call**

  There are multiple `finishRun` calls in the route (blocked path, OpenAI error, OpenAI stream finalize, local stream finalize). Add `toolsUsed` to each one.

  For the blocked path (no OpenAI key):
  ```typescript
  await finishRun(run.id, {
    status: "blocked",
    response: assistantReply,
    toolsUsed,
  });
  ```

  For OpenAI error paths and the `finalize` closure in the OpenAI stream, pass `toolsUsed` into the closure. Add `toolsUsed` to the `finalize` call inside the OpenAI stream:
  ```typescript
  await finishRun(run.id, {
    status,
    response: assistantReply,
    errorMessage: errorMessage ?? null,
    providerResponseId,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: costUsd,
    toolsUsed,
  });
  ```

  For local Ollama `finishRun` calls (there are two — in `chunk.done` and in the fallback):
  ```typescript
  await finishRun(run.id, {
    status: "completed",
    response: assistantReply,
    toolsUsed,
  });
  ```

  And for the local error path:
  ```typescript
  await finishRun(run.id, {
    status: "failed",
    response: assistantReply,
    errorMessage: error instanceof Error ? error.message : "Chat stream failed.",
    toolsUsed,
  });
  ```

- [ ] **Step 5: Fix retrieval tracking**

  The `toolsUsed.push("retrieval")` line added in Step 2 checks `citations.some(c => c.source !== "search")` which is wrong — retrieval citations have no `source` field set. Replace that line with a simpler approach: track retrieval separately.

  Remove the retrieval push from Step 2's block. Instead, update the retrieval block to push to `toolsUsed`:

  ```typescript
  if (payload.useRetrieval) {
    try {
      const retrievalResults = await searchDocs(prompt);
      citations = retrievalResults;
      if (retrievalResults.length > 0) toolsUsed.push("retrieval");
    } catch {
      citations = [];
    }
  }

  const toolsUsed: string[] = [];
  ```

  Wait — `toolsUsed` must be declared before it's used. Declare it before the retrieval block:

  ```typescript
  const toolsUsed: string[] = [];

  if (payload.useRetrieval) {
    try {
      const retrievalResults = await searchDocs(prompt);
      citations = retrievalResults;
      if (retrievalResults.length > 0) toolsUsed.push("retrieval");
    } catch {
      citations = [];
    }
  }

  if (decision.route === "chat" && decision.tools.includes("search")) {
    if (session.user.searchEnabled && process.env.TAVILY_API_KEY) {
      const searchResults = await webSearch(prompt);
      if (searchResults.length > 0) {
        citations = [...citations, ...searchResults];
        toolsUsed.push("search");
      }
    } else {
      let decision = classifyChatPrompt(prompt); // already declared above — just reassign:
      decision = {
        route: "escalate",
        tools: [],
        provider: "remote",
        model: null,
        reason: decision.reason,
      };
    }
  }
  ```

  Actually, since `decision` needs to be reassigned, ensure the `let decision = classifyChatPrompt(prompt)` is already in place (Step 3). Then the reassignment is:

  ```typescript
  decision = {
    route: "escalate",
    tools: [],
    provider: "remote",
    model: null,
    reason: decision.reason,
  };
  ```

- [ ] **Step 6: Type-check**

  ```bash
  cd apps/web && npm run typecheck
  ```

  Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/api/chat/route.ts
  git commit -m "feat(api): wire web search into chat route, collect toolsUsed"
  ```

---

### Task 6: Admin search toggle

**Files:**
- Modify: `apps/web/app/(app)/admin/users/actions.ts`
- Create: `apps/web/app/(app)/admin/users/search-toggle.tsx`
- Modify: `apps/web/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: Add `setSearchEnabledAction` to actions.ts**

  In `apps/web/app/(app)/admin/users/actions.ts`, add after the `changeRoleAction` export:

  ```typescript
  export async function setSearchEnabledAction(
    targetUserId: string,
    enabled: boolean,
  ): Promise<void> {
    const admin = await requireAdmin();
    if (!admin) return;
    if (admin.user.id === targetUserId) return;

    const db = requireDb();
    await db
      .update(users)
      .set({ searchEnabled: enabled, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    revalidatePath("/admin/users");
  }
  ```

- [ ] **Step 2: Create `search-toggle.tsx`**

  Create `apps/web/app/(app)/admin/users/search-toggle.tsx`:

  ```typescript
  "use client";

  import { useTransition } from "react";
  import { setSearchEnabledAction } from "./actions";

  export function SearchToggle({
    userId,
    searchEnabled,
  }: {
    userId: string;
    searchEnabled: boolean;
  }) {
    const [pending, startTransition] = useTransition();

    return (
      <button
        disabled={pending}
        onClick={() =>
          startTransition(() => setSearchEnabledAction(userId, !searchEnabled))
        }
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "0.2rem 0.6rem",
          cursor: pending ? "not-allowed" : "pointer",
          fontSize: "0.8rem",
        }}
      >
        {pending ? "Saving…" : searchEnabled ? "Disable search" : "Enable search"}
      </button>
    );
  }
  ```

- [ ] **Step 3: Update `page.tsx` to show Search column**

  In `apps/web/app/(app)/admin/users/page.tsx`, add the import:

  ```typescript
  import { SearchToggle } from "./search-toggle";
  ```

  Add a "Search" `<th>` after the empty action header:

  ```tsx
  <th style={{ padding: "0.5rem" }}>Search</th>
  <th style={{ padding: "0.5rem" }}></th>
  ```

  Add the `<td>` for each user row after the role `<td>`:

  ```tsx
  <td style={{ padding: "0.5rem" }}>
    {u.searchEnabled ? "on" : "off"}
  </td>
  <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
    {u.id !== currentUser.id && (
      <>
        <RoleToggle userId={u.id} currentRole={u.role} />
        <SearchToggle userId={u.id} searchEnabled={u.searchEnabled} />
      </>
    )}
  </td>
  ```

  The updated table header row:
  ```tsx
  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
    <th style={{ padding: "0.5rem" }}>Email</th>
    <th style={{ padding: "0.5rem" }}>Display name</th>
    <th style={{ padding: "0.5rem" }}>Role</th>
    <th style={{ padding: "0.5rem" }}>Search</th>
    <th style={{ padding: "0.5rem" }}>Joined</th>
    <th style={{ padding: "0.5rem" }}></th>
  </tr>
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd apps/web && npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(app\)/admin/users/
  git commit -m "feat(admin): add per-user search enable/disable toggle"
  ```

---

### Task 7: Admin runs page — Tools column

**Files:**
- Modify: `apps/web/app/(app)/admin/runs/page.tsx`

- [ ] **Step 1: Add Tools column to the runs table**

  In `apps/web/app/(app)/admin/runs/page.tsx`, add a "Tools" `<th>` after the "Reason" column:

  Replace the current header row closing with:
  ```tsx
  <th style={{ padding: "0.5rem" }}>Reason</th>
  <th style={{ padding: "0.5rem" }}>Tools</th>
  ```

  Add the tools `<td>` after the reason cell in each row:

  ```tsx
  <td style={{ padding: "0.5rem", color: "var(--muted)" }}>
    {run.decisionReason ?? run.errorMessage ?? "—"}
  </td>
  <td style={{ padding: "0.5rem" }}>
    {Array.isArray(run.toolsUsed) && run.toolsUsed.length > 0
      ? run.toolsUsed.join(", ")
      : "—"}
  </td>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd apps/web && npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/app/\(app\)/admin/runs/page.tsx
  git commit -m "feat(admin): show tools used in mediator runs table"
  ```

---

### Task 8: Chat UI — search citation rendering

**Files:**
- Modify: `apps/web/app/(app)/dashboard/chat-workspace.tsx`

- [ ] **Step 1: Extend the local `ChatMessage` citation type**

  In `chat-workspace.tsx`, find the `ChatMessage` type and extend its `citations` array item type:

  ```typescript
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
      source?: string;
      url?: string;
    }> | null;
    createdAt: string;
  };
  ```

- [ ] **Step 2: Update the `ChatStreamEvent` citations type**

  The `citations` event type in `ChatStreamEvent` uses `NonNullable<ChatMessage["citations"]>` — this automatically picks up the new fields. No change needed.

- [ ] **Step 3: Update citation rendering**

  Find the citations render block (around line 450):

  ```tsx
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
  ```

  Replace with:

  ```tsx
  {message.citations && message.citations.length > 0 && (
    <div className="chat-citation-list">
      <p className="chat-citation-label">Sources</p>
      {message.citations.map((citation, index) => (
        <div key={citation.chunkId} className="chat-citation-item">
          <strong>
            [{index + 1}] {citation.documentTitle}
            {citation.source === "search" && (
              <span
                style={{
                  marginLeft: "0.4rem",
                  fontSize: "0.72rem",
                  background: "rgba(187,77,0,0.12)",
                  color: "var(--accent)",
                  borderRadius: 4,
                  padding: "0 0.3rem",
                  verticalAlign: "middle",
                }}
              >
                Web
              </span>
            )}
          </strong>
          <span>{citation.excerpt}</span>
          {citation.url && (
            <a
              href={citation.url}
              rel="noopener noreferrer"
              target="_blank"
              className="chat-doc-link"
              style={{ fontSize: "0.78rem" }}
            >
              {citation.url.length > 60
                ? `${citation.url.slice(0, 57)}...`
                : citation.url}
            </a>
          )}
        </div>
      ))}
    </div>
  )}
  ```

- [ ] **Step 4: Update the status kicker text**

  In the composer footer, find the kicker paragraph and add a search state:

  ```tsx
  <p className="chat-kicker">
    {pending
      ? "Streaming response..."
      : useRetrieval && documents.length > 0
        ? "Knowledge base retrieval enabled"
        : "Authenticated users only"}
  </p>
  ```

  This doesn't need to mention search — search is automatic and shown in citations. Leave it as-is.

- [ ] **Step 5: Type-check**

  ```bash
  cd apps/web && npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/\(app\)/dashboard/chat-workspace.tsx
  git commit -m "feat(ui): render search citations with Web badge and URL link"
  ```

---

### Task 9: Env and compose wiring

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add `TAVILY_API_KEY` to `.env.example`**

  Add a new section after the Ollama block:

  ```
  # ─── Web search (Phase 7) ────────────────────────────────────────────────────
  # Tavily API key — enables web search for authenticated users.
  # Get a key at https://tavily.com (1,000 free queries/month).
  # Admin can disable search per user at /admin/users.
  # Leave empty to disable web search entirely.
  TAVILY_API_KEY=
  ```

- [ ] **Step 2: Inject `TAVILY_API_KEY` into the `web` service in `docker-compose.yml`**

  In the `web` service `environment` block, add after the Ollama vars:

  ```yaml
  TAVILY_API_KEY: ${TAVILY_API_KEY:-}
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add .env.example docker-compose.yml
  git commit -m "feat(infra): add TAVILY_API_KEY to env and compose"
  ```

---

### Task 10: Final verification

- [ ] **Step 1: Run migrations against the test DB**

  The test setup in `apps/web/__tests__/setup.ts` uses `drizzle-kit migrate` via `testDb`. Confirm the migration runs:

  ```bash
  cd apps/web && npm test
  ```

  Expected: all tests pass (the new `search_enabled` and `tools_used` columns exist in the test DB after migration).

- [ ] **Step 2: Full build**

  ```bash
  cd apps/web && npm run build
  ```

  Expected: build completes with no errors or type errors.

- [ ] **Step 3: Verify exit criteria against the spec**

  - ✅ Search-capable queries (`"latest news"`, `"current price"`, `"search the web for..."`) produce `tools: ["search"]` from the classifier and call `webSearch` if `TAVILY_API_KEY` is set and user has `searchEnabled: true`.
  - ✅ Plain queries produce `tools: []` and stay on the direct local path.
  - ✅ Tool use is written to `runs.toolsUsed` and visible at `/admin/runs` in the Tools column.

- [ ] **Step 4: Final commit**

  If any last-minute fixes were needed:

  ```bash
  git add -p
  git commit -m "fix(phase7): final build and migration verification"
  ```

---

## Self-review notes

- **Spec coverage:** All Phase 7 exit criteria are covered. Schema (Task 1), classifier (Task 2), tool (Task 3), runs (Task 4), API (Task 5), admin allowlist (Task 6), audit trail (Task 7), UI (Task 8), infra (Task 9).
- **Type consistency:** `ChatDecision.tools` defined in Task 2, used in Task 5. `MessageCitation.source` and `url` defined in Task 1, used in Tasks 3 and 8. `finishRun({ toolsUsed })` defined in Task 4, called in Task 5. `searchEnabled` on `users` defined in Task 1, read via `session.user.searchEnabled` in Task 5, toggled in Task 6.
- **No placeholders:** All steps contain exact code.
- **Constraint check:** Classifier stays two-route (`chat | escalate`). No LLM routing call added. Search + escalation are never combined on the same turn. `TAVILY_API_KEY` is the only infra addition.
