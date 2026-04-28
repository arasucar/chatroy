"use client";

import { useActionState } from "react";
import { createDocumentAction, type CreateDocumentState } from "./actions";

export function CreateDocumentForm() {
  const [state, formAction, pending] = useActionState<CreateDocumentState, FormData>(
    createDocumentAction,
    null,
  );

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 560 }}
    >
      {state?.error && <p className="tp-error-msg">{state.error}</p>}
      {state?.success && <p className="tp-success-msg">{state.success}</p>}

      <label className="tp-field">
        <span className="tp-field-label">Title (Optional)</span>
        <input
          className="tp-input"
          name="title"
          type="text"
        />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Upload Text Or Markdown</span>
        <input className="tp-file-input" name="file" type="file" accept=".txt,.md,text/plain,text/markdown" />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Or Paste Document Text</span>
        <textarea
          className="tp-input"
          name="rawText"
          rows={10}
        />
      </label>

      <button
        className="tp-btn tp-btn-primary"
        type="submit"
        disabled={pending}
        style={{ justifySelf: "start" }}
      >
        {pending ? "Indexing…" : "Upload and index"}
      </button>
    </form>
  );
}
