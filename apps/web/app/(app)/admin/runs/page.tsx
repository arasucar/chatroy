import { inArray } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { conversations, scripts, users } from "@/lib/db/schema";
import { listRecentRuns } from "@/lib/runs";

export default async function AdminRunsPage() {
  const db = requireDb();
  const recentRuns = await listRecentRuns(100);

  const userIds = [...new Set(recentRuns.map((run) => run.userId))];
  const conversationIds = [...new Set(recentRuns.map((run) => run.conversationId))];
  const scriptIds = [...new Set(recentRuns.flatMap((run) => (run.scriptId ? [run.scriptId] : [])))];

  const [knownUsers, knownConversations, knownScripts] = await Promise.all([
    userIds.length
      ? db.query.users.findMany({ where: inArray(users.id, userIds) })
      : Promise.resolve([]),
    conversationIds.length
      ? db.query.conversations.findMany({ where: inArray(conversations.id, conversationIds) })
      : Promise.resolve([]),
    scriptIds.length
      ? db.query.scripts.findMany({ where: inArray(scripts.id, scriptIds) })
      : Promise.resolve([]),
  ]);

  const userById = new Map(knownUsers.map((user) => [user.id, user]));
  const conversationById = new Map(knownConversations.map((c) => [c.id, c]));
  const scriptById = new Map(knownScripts.map((s) => [s.id, s]));

  return (
    <main style={{ padding: "2rem", maxWidth: 1200 }}>
      <h1 style={{ marginBottom: "2rem" }}>Mediator runs</h1>
      {recentRuns.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No runs recorded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.5rem" }}>When</th>
              <th style={{ padding: "0.5rem" }}>User</th>
              <th style={{ padding: "0.5rem" }}>Conversation</th>
              <th style={{ padding: "0.5rem" }}>Route</th>
              <th style={{ padding: "0.5rem" }}>Provider</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Model</th>
              <th style={{ padding: "0.5rem" }}>Usage</th>
              <th style={{ padding: "0.5rem" }}>Cost</th>
              <th style={{ padding: "0.5rem" }}>Reason / Script</th>
              <th style={{ padding: "0.5rem" }}>Tools</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run) => {
              const user = userById.get(run.userId);
              const conversation = conversationById.get(run.conversationId);
              const script = run.scriptId ? scriptById.get(run.scriptId) : null;

              return (
                <tr key={run.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                    {run.createdAt.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.5rem" }}>{user?.email ?? run.userId.slice(0, 8)}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {conversation?.title ?? run.conversationId.slice(0, 8)}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: run.route === "script" ? "var(--accent)" : "inherit",
                      }}
                    >
                      {run.route}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{run.provider}</td>
                  <td style={{ padding: "0.5rem" }}>{run.status}</td>
                  <td style={{ padding: "0.5rem" }}>{run.model ?? "—"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {run.totalTokens ? `${run.totalTokens.toLocaleString()} tok` : "—"}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {typeof run.estimatedCostUsd === "number"
                      ? `$${run.estimatedCostUsd.toFixed(4)}`
                      : "—"}
                  </td>
                  <td style={{ padding: "0.5rem", color: "var(--muted)" }}>
                    {script ? (
                      <a href={`/admin/scripts/${script.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {script.name}
                      </a>
                    ) : (
                      run.decisionReason ?? run.errorMessage ?? "—"
                    )}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {Array.isArray(run.toolsUsed) && run.toolsUsed.length > 0
                      ? run.toolsUsed.join(", ")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
