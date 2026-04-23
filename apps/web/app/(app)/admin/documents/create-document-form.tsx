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
      {state?.error && <p style={{ color: "var(--accent)" }}>{state.error}</p>}
      {state?.success && <p style={{ color: "var(--muted)" }}>{state.success}</p>}

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Title (optional)</span>
        <input
          name="title"
          type="text"
          style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Upload text or markdown</span>
        <input name="file" type="file" accept=".txt,.md,text/plain,text/markdown" />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Or paste document text</span>
        <textarea
          name="rawText"
          rows={10}
          style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 4 }}
        />
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
        {pending ? "Indexing…" : "Upload and index"}
      </button>
    </form>
  );
}
