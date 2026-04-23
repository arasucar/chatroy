"use client";

import { useActionState } from "react";
import {
  deleteOpenAISettingsAction,
  saveOpenAISettingsAction,
  type SaveProviderState,
} from "./actions";

export function OpenAISettingsForm({
  keyHint,
  defaultModel,
  canStoreSecrets,
}: {
  keyHint: string | null;
  defaultModel: string;
  canStoreSecrets: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveProviderState, FormData>(
    saveOpenAISettingsAction,
    null,
  );

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 520 }}>
      {!canStoreSecrets && (
        <p style={{ color: "var(--accent)" }}>
          USER_KEY_ENCRYPTION_KEY is not configured on the server, so remote keys cannot be stored yet.
        </p>
      )}
      {state?.error && <p style={{ color: "var(--accent)" }}>{state.error}</p>}
      {state?.success && <p style={{ color: "var(--muted)" }}>{state.success}</p>}

      <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>OpenAI API key</span>
          <input
            name="apiKey"
            type="password"
            placeholder={keyHint ? `Stored key ending in ${keyHint}` : "sk-..."}
            disabled={!canStoreSecrets || pending}
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>Default remote model</span>
          <select
            name="defaultModel"
            defaultValue={defaultModel}
            disabled={!canStoreSecrets || pending}
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
          >
            <option value="gpt-5-mini">gpt-5-mini</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={!canStoreSecrets || pending}
          style={{
            padding: "0.6rem 1.2rem",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "Saving…" : keyHint ? "Update OpenAI key" : "Save OpenAI key"}
        </button>
      </form>

      {keyHint && (
        <form action={deleteOpenAISettingsAction}>
          <button
            type="submit"
            style={{
              justifySelf: "start",
              padding: "0.5rem 0.9rem",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Remove OpenAI key
          </button>
        </form>
      )}
    </div>
  );
}
