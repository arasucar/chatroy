import { desc, eq, sql } from "drizzle-orm";
import { requireDb } from "./db";
import { runs } from "./db/schema";
import type { ChatDecision } from "./mediator";
import { excerpt } from "./utils";

export type RunRow = typeof runs.$inferSelect;

export async function createRun(input: {
  conversationId: string;
  userId: string;
  decision: ChatDecision;
  prompt: string;
}): Promise<RunRow> {
  const db = requireDb();
  const [run] = await db
    .insert(runs)
    .values({
      conversationId: input.conversationId,
      userId: input.userId,
      route: input.decision.route,
      provider: input.decision.provider,
      status: "started",
      model: input.decision.model,
      decisionReason: input.decision.reason,
      requestExcerpt: excerpt(input.prompt),
      scriptId: input.decision.route === "script" ? input.decision.script.id : null,
    })
    .returning();

  return run;
}

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

export async function listRecentRuns(limit = 100): Promise<RunRow[]> {
  const db = requireDb();
  return db.query.runs.findMany({
    orderBy: [desc(runs.createdAt)],
    limit,
  });
}

export async function getConversationRunCostSummary(conversationId: string): Promise<{
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  const db = requireDb();
  const [row] = await db
    .select({
      estimatedCostUsd: sql<number>`coalesce(sum(${runs.estimatedCostUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${runs.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${runs.outputTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${runs.totalTokens}), 0)`,
    })
    .from(runs)
    .where(eq(runs.conversationId, conversationId));

  return {
    estimatedCostUsd: Number(row?.estimatedCostUsd ?? 0),
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0),
  };
}
