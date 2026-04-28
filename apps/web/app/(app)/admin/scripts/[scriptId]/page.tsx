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
    <main style={{ maxWidth: 960 }}>
      <h1 className="tp-page-title">{script.name}</h1>
      <p className="tp-page-sub">
        {script.description ?? "Script definition · Manual execution console"}
      </p>

      <section className="tp-section" style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Definition</h2>
        <div className="tp-detail-grid">
          <span className="tp-field-label">Command</span>
          <code className="tp-code-inline">{script.command}</code>
          <span className="tp-field-label">Argv Template</span>
          <code className="tp-code-inline">{JSON.stringify(script.argvTemplate)}</code>
          <span className="tp-field-label">Enabled</span>
          <span className={script.enabled ? "tp-badge tp-badge-ok" : "tp-badge tp-badge-error"}>
            {script.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="tp-field-label">Step-Up</span>
          <span className={script.requiresStepUp ? "tp-badge tp-badge-warn" : "tp-badge"}>
            {script.requiresStepUp ? "Required" : "Not Required"}
          </span>
        </div>
      </section>

      <section className="tp-section" style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Run Manually</h2>
        <RunScriptForm
          scriptId={script.id}
          paramsSchema={script.paramsSchema}
          requiresStepUp={script.requiresStepUp}
        />
      </section>

      <section className="tp-section">
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Recent Runs</h2>
        {runs.length === 0 ? (
          <p className="tp-mono">No runs recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {runs.map((run) => (
              <details
                key={run.id}
                className="tp-run-card"
              >
                <summary className="tp-run-summary">
                  <span className="tp-mono" style={{ minWidth: 160 }}>{run.createdAt.toLocaleString()}</span>
                  <code className="tp-code-inline">
                    exit {run.exitCode ?? "?"}
                  </code>
                  <span className={run.status === "completed" ? "tp-badge tp-badge-ok" : "tp-badge tp-badge-error"}>
                    {run.status}
                  </span>
                  <code className="tp-code-inline">
                    {[run.resolvedCommand, ...run.resolvedArgv].join(" ")}
                  </code>
                </summary>
                {(run.stdout || run.stderr) && (
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {run.stdout?.trim() && (
                      <pre className="tp-code-block">
                        {run.stdout.trim()}
                      </pre>
                    )}
                    {run.stderr?.trim() && (
                      <pre className="tp-code-block tp-code-block-error">
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
