import { notFound } from "next/navigation";
import { getScriptById, listScriptRuns } from "@/lib/scripts";
import { RunScriptForm } from "./run-script-form";

type Props = {
  params: Promise<{ scriptId: string }>;
};

export default async function AdminScriptDetailPage({ params }: Props) {
  const { scriptId } = await params;
  const script = await getScriptById(scriptId);
  if (!script) notFound();

  const runs = await listScriptRuns(script.id);

  return (
    <main style={{ padding: "2rem", maxWidth: 960 }}>
      <h1 style={{ marginBottom: "1rem" }}>{script.name}</h1>
      {script.description && (
        <p style={{ marginBottom: "1.5rem", color: "var(--muted)" }}>{script.description}</p>
      )}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Definition</h2>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div><strong>Command:</strong> <code>{script.command}</code></div>
          <div><strong>Argv template:</strong> <code>{JSON.stringify(script.argvTemplate)}</code></div>
          <div><strong>Enabled:</strong> {script.enabled ? "yes" : "no"}</div>
          <div><strong>Step-up:</strong> {script.requiresStepUp ? "required" : "not required"}</div>
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Run manually</h2>
        <RunScriptForm
          scriptId={script.id}
          paramsSchema={script.paramsSchema}
          requiresStepUp={script.requiresStepUp}
        />
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Recent runs</h2>
        {runs.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No runs recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {runs.map((run) => (
              <details
                key={run.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                  fontSize: "0.875rem",
                }}
              >
                <summary style={{ cursor: "pointer", display: "flex", gap: "1rem", alignItems: "baseline", listStyle: "none" }}>
                  <span style={{ color: "var(--muted)", minWidth: 160 }}>{run.createdAt.toLocaleString()}</span>
                  <code style={{ fontSize: "0.8rem", background: "rgba(29,30,32,0.06)", borderRadius: 6, padding: "1px 6px" }}>
                    exit {run.exitCode ?? "?"}
                  </code>
                  <span
                    style={{
                      fontWeight: 600,
                      color: run.status === "completed" ? "var(--text)" : "var(--accent)",
                    }}
                  >
                    {run.status}
                  </span>
                  <code style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    {[run.resolvedCommand, ...run.resolvedArgv].join(" ")}
                  </code>
                </summary>
                {(run.stdout || run.stderr) && (
                  <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                    {run.stdout?.trim() && (
                      <pre
                        style={{
                          margin: 0,
                          padding: "0.6rem 0.75rem",
                          background: "rgba(29,30,32,0.05)",
                          borderRadius: 8,
                          fontSize: "0.8rem",
                          overflow: "auto",
                          maxHeight: 320,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {run.stdout.trim()}
                      </pre>
                    )}
                    {run.stderr?.trim() && (
                      <pre
                        style={{
                          margin: 0,
                          padding: "0.6rem 0.75rem",
                          background: "rgba(187,77,0,0.06)",
                          borderRadius: 8,
                          fontSize: "0.8rem",
                          overflow: "auto",
                          maxHeight: 200,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: "var(--accent)",
                        }}
                      >
                        {run.stderr.trim()}
                      </pre>
                    )}
                  </div>
                )}
              </details>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
