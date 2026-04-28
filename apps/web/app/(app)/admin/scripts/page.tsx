import { listScripts } from "@/lib/scripts";
import { CreateScriptForm } from "./create-script-form";

export default async function AdminScriptsPage() {
  const allScripts = await listScripts();

  return (
    <main>
      <h1 className="tp-page-title">Script Registry</h1>
      <p className="tp-page-sub">Controlled command bridge · Step-up execution policy</p>

      <section className="tp-section" style={{ marginBottom: 32, maxWidth: 840 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Register Script
        </h2>
        <CreateScriptForm />
      </section>

      <section className="tp-section" style={{ maxWidth: 1080 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Registered Scripts
        </h2>
        {allScripts.length === 0 ? (
          <p className="tp-mono">No scripts registered yet.</p>
        ) : (
          <table className="tp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Command</th>
                <th>Enabled</th>
                <th>Step-up</th>
                <th>Params</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {allScripts.map((script) => (
                <tr key={script.id}>
                  <td>
                    <strong style={{ color: "var(--tp-on-surface)" }}>{script.name}</strong>
                    {script.description && (
                      <div style={{ color: "var(--tp-outline)", marginTop: 4 }}>
                        {script.description}
                      </div>
                    )}
                  </td>
                  <td className="tp-mono">{script.command}</td>
                  <td>
                    <span className={script.enabled ? "tp-badge tp-badge-ok" : "tp-badge tp-badge-error"}>
                      {script.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <span className={script.requiresStepUp ? "tp-badge tp-badge-warn" : "tp-badge"}>
                      {script.requiresStepUp ? "Required" : "No"}
                    </span>
                  </td>
                  <td>
                    {Array.isArray(script.paramsSchema) ? script.paramsSchema.length : 0}
                  </td>
                  <td>
                    <a
                      className="tp-mono"
                      href={`/admin/scripts/${script.id}`}
                      style={{ color: "var(--tp-primary)" }}
                    >
                      {script.updatedAt.toLocaleString()}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
