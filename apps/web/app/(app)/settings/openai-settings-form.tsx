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
        <p className="tp-error-msg">
          USER_KEY_ENCRYPTION_KEY is not configured on the server, so remote keys cannot be stored yet.
        </p>
      )}
      {state?.error && <p className="tp-error-msg">{state.error}</p>}
      {state?.success && <p className="tp-success-msg">{state.success}</p>}

      <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
        <label className="tp-field">
          <span className="tp-field-label">OpenAI API Key</span>
          <input
            className="tp-input"
            name="apiKey"
            type="password"
            placeholder={keyHint ? `Stored key ending in ${keyHint}` : "sk-..."}
            disabled={!canStoreSecrets || pending}
          />
        </label>

        <label className="tp-field">
          <span className="tp-field-label">Default Remote Model</span>
          <select
            className="tp-select"
            name="defaultModel"
            defaultValue={defaultModel}
            disabled={!canStoreSecrets || pending}
          >
            <option value="gpt-5-mini">gpt-5-mini</option>
          </select>
        </label>

        <button
          className="tp-btn tp-btn-primary"
          type="submit"
          disabled={!canStoreSecrets || pending}
          style={{ justifySelf: "start" }}
        >
          {pending ? "Saving…" : keyHint ? "Update OpenAI key" : "Save OpenAI key"}
        </button>
      </form>

      {keyHint && (
        <form action={deleteOpenAISettingsAction}>
          <button
            className="tp-btn tp-btn-danger"
            type="submit"
          >
            Remove OpenAI key
          </button>
        </form>
      )}
    </div>
  );
}
