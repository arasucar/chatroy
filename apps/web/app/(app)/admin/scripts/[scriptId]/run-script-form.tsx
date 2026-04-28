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
      {state?.error && <p className="tp-error-msg">{state.error}</p>}
      {state?.success && <p className="tp-success-msg">{state.success}</p>}

      {requiresStepUp && (
        <label className="tp-field">
          <span className="tp-field-label">Confirm Your Password</span>
          <input
            className="tp-input"
            name="password"
            type="password"
            autoComplete="current-password"
          />
        </label>
      )}

      {paramsSchema.length === 0 ? (
        <p className="tp-mono">This script does not require params.</p>
      ) : (
        paramsSchema.map((param) => (
          <label key={param.name} className="tp-field">
            <span className="tp-field-label">{param.label}</span>
            {param.type === "enum" ? (
              <select
                className="tp-select"
                name={param.name}
                defaultValue={param.options?.[0] ?? ""}
              >
                {(param.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : param.type === "boolean" ? (
              <span className="tp-toggle">
                <input name={param.name} type="checkbox" />
                <span className="tp-toggle-track" />
                <span className="tp-toggle-thumb" />
              </span>
            ) : (
              <input
                className="tp-input"
                name={param.name}
                type={param.type === "number" ? "number" : "text"}
              />
            )}
            {param.description && (
              <span className="tp-mono" style={{ textTransform: "none" }}>{param.description}</span>
            )}
          </label>
        ))
      )}

      <button
        className="tp-btn tp-btn-primary"
        type="submit"
        disabled={pending}
        style={{ justifySelf: "start" }}
      >
        {pending ? "Running…" : "Run script"}
      </button>
    </form>
  );
}
