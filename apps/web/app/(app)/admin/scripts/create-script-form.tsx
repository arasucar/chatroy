"use client";

import { useActionState } from "react";
import { createScriptAction, type CreateScriptState } from "./actions";

const exampleArgv = JSON.stringify(["status", "--env", "{environment}"], null, 2);
const exampleParams = JSON.stringify(
  [
    {
      name: "environment",
      label: "Environment",
      type: "enum",
      required: true,
      options: ["dev", "staging", "prod"],
      description: "Target environment passed as a single argv token.",
    },
  ],
  null,
  2,
);

export function CreateScriptForm() {
  const [state, formAction, pending] = useActionState<CreateScriptState, FormData>(
    createScriptAction,
    null,
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem", maxWidth: 680 }}>
      {state?.error && <p style={{ color: "var(--accent)" }}>{state.error}</p>}
      {state?.success && <p style={{ color: "var(--muted)" }}>{state.success}</p>}

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Name</span>
        <input name="name" type="text" style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }} />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Description</span>
        <textarea name="description" rows={3} style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 4 }} />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Command</span>
        <input name="command" type="text" placeholder="/usr/bin/systemctl" style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }} />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Argv template (JSON array)</span>
        <textarea name="argvTemplate" defaultValue={exampleArgv} rows={5} style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "monospace" }} />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Params schema (JSON array)</span>
        <textarea name="paramsSchema" defaultValue={exampleParams} rows={10} style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "monospace" }} />
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
        <input name="enabled" type="checkbox" defaultChecked />
        <span>Enabled</span>
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
        <input name="requiresStepUp" type="checkbox" />
        <span>Require recent password confirmation before execution</span>
      </label>

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
        {pending ? "Saving…" : "Register script"}
      </button>
    </form>
  );
}
