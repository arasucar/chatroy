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
    <main>
      <h1 className="tp-page-title">Mediator Runs</h1>
      <p className="tp-page-sub">Routing decisions · Provider usage · Tool telemetry</p>
      <section className="tp-section" style={{ maxWidth: 1280, overflowX: "auto" }}>
        {recentRuns.length === 0 ? (
          <p className="tp-mono">No runs recorded yet.</p>
        ) : (
        <table className="tp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Conversation</th>
              <th>Route</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Model</th>
              <th>Usage</th>
              <th>Cost</th>
              <th>Reason / Script</th>
              <th>Tools</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run) => {
              const user = userById.get(run.userId);
              const conversation = conversationById.get(run.conversationId);
              const script = run.scriptId ? scriptById.get(run.scriptId) : null;

              return (
                <tr key={run.id}>
                  <td className="tp-mono" style={{ whiteSpace: "nowrap" }}>
                    {run.createdAt.toLocaleString()}
                  </td>
                  <td>{user?.email ?? run.userId.slice(0, 8)}</td>
                  <td>
                    {conversation?.title ?? run.conversationId.slice(0, 8)}
                  </td>
                  <td>
                    <span className={run.route === "script" ? "tp-badge tp-badge-warn" : "tp-badge"}>
                      {run.route}
                    </span>
                  </td>
                  <td>{run.provider}</td>
                  <td>
                    <span className={run.status === "completed" ? "tp-badge tp-badge-ok" : "tp-badge tp-badge-error"}>
                      {run.status}
                    </span>
                  </td>
                  <td className="tp-mono">{run.model ?? "—"}</td>
                  <td>
                    {run.totalTokens ? `${run.totalTokens.toLocaleString()} tok` : "—"}
                  </td>
                  <td>
                    {typeof run.estimatedCostUsd === "number"
                      ? `$${run.estimatedCostUsd.toFixed(4)}`
                      : "—"}
                  </td>
                  <td>
                    {script ? (
                      <a href={`/admin/scripts/${script.id}`} style={{ color: "var(--tp-primary)", fontWeight: 600 }}>
                        {script.name}
                      </a>
                    ) : (
                      run.decisionReason ?? run.errorMessage ?? "—"
                    )}
                  </td>
                  <td>
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
      </section>
    </main>
  );
}
