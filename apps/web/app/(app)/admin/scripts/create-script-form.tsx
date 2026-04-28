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
      {state?.error && <p className="tp-error-msg">{state.error}</p>}
      {state?.success && <p className="tp-success-msg">{state.success}</p>}

      <label className="tp-field">
        <span className="tp-field-label">Name</span>
        <input className="tp-input" name="name" type="text" />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Description</span>
        <textarea className="tp-input" name="description" rows={3} />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Command</span>
        <input className="tp-input" name="command" type="text" placeholder="/usr/bin/systemctl" />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Argv Template (JSON Array)</span>
        <textarea
          className="tp-input"
          name="argvTemplate"
          defaultValue={exampleArgv}
          rows={5}
          style={{ fontFamily: "'Space Grotesk', monospace" }}
        />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Params Schema (JSON Array)</span>
        <textarea
          className="tp-input"
          name="paramsSchema"
          defaultValue={exampleParams}
          rows={10}
          style={{ fontFamily: "'Space Grotesk', monospace" }}
        />
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span className="tp-toggle">
          <input name="enabled" type="checkbox" defaultChecked />
          <span className="tp-toggle-track" />
          <span className="tp-toggle-thumb" />
        </span>
        <span className="tp-mono">Enabled</span>
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span className="tp-toggle">
          <input name="requiresStepUp" type="checkbox" />
          <span className="tp-toggle-track" />
          <span className="tp-toggle-thumb" />
        </span>
        <span className="tp-mono">Require recent password confirmation before execution</span>
      </label>

      <button
        className="tp-btn tp-btn-primary"
        type="submit"
        disabled={pending}
        style={{ justifySelf: "start" }}
      >
        {pending ? "Saving…" : "Register script"}
      </button>
    </form>
  );
}
