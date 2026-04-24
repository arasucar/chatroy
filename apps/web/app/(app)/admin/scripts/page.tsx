import { listScripts } from "@/lib/scripts";
import { CreateScriptForm } from "./create-script-form";

export default async function AdminScriptsPage() {
  const allScripts = await listScripts();

  return (
    <main style={{ padding: "2rem", maxWidth: 1080 }}>
      <h1 style={{ marginBottom: "2rem" }}>Scripts</h1>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Register script</h2>
        <CreateScriptForm />
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Registered scripts</h2>
        {allScripts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No scripts registered yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem" }}>Command</th>
                <th style={{ padding: "0.5rem" }}>Enabled</th>
                <th style={{ padding: "0.5rem" }}>Step-up</th>
                <th style={{ padding: "0.5rem" }}>Params</th>
                <th style={{ padding: "0.5rem" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {allScripts.map((script) => (
                <tr key={script.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <strong>{script.name}</strong>
                    {script.description && (
                      <div style={{ color: "var(--muted)", marginTop: "0.25rem" }}>{script.description}</div>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{script.command}</td>
                  <td style={{ padding: "0.5rem" }}>{script.enabled ? "yes" : "no"}</td>
                  <td style={{ padding: "0.5rem" }}>{script.requiresStepUp ? "required" : "no"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {Array.isArray(script.paramsSchema) ? script.paramsSchema.length : 0}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <a href={`/admin/scripts/${script.id}`}>{script.updatedAt.toLocaleString()}</a>
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
