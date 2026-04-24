"use client";

import { useActionState } from "react";
import type { ScriptParamDefinition } from "@/lib/db/schema";
import { runScriptAction, type RunScriptState } from "./actions";

export function RunScriptForm({
  scriptId,
  paramsSchema,
  requiresStepUp,
}: {
  scriptId: string;
  paramsSchema: ScriptParamDefinition[];
  requiresStepUp: boolean;
}) {
  const boundAction = runScriptAction.bind(null, scriptId);
  const [state, formAction, pending] = useActionState<RunScriptState, FormData>(
    boundAction,
    null,
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem", maxWidth: 520 }}>
      {state?.error && <p style={{ color: "var(--accent)" }}>{state.error}</p>}
      {state?.success && <p style={{ color: "var(--muted)" }}>{state.success}</p>}

      {requiresStepUp && (
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>Confirm your password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
          />
        </label>
      )}

      {paramsSchema.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>This script does not require params.</p>
      ) : (
        paramsSchema.map((param) => (
          <label key={param.name} style={{ display: "grid", gap: "0.25rem" }}>
            <span>{param.label}</span>
            {param.type === "enum" ? (
              <select
                name={param.name}
                defaultValue={param.options?.[0] ?? ""}
                style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
              >
                {(param.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : param.type === "boolean" ? (
              <input name={param.name} type="checkbox" />
            ) : (
              <input
                name={param.name}
                type={param.type === "number" ? "number" : "text"}
                style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
              />
            )}
            {param.description && (
              <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{param.description}</span>
            )}
          </label>
        ))
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.6rem 1.2rem",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Running…" : "Run script"}
      </button>
    </form>
  );
}
