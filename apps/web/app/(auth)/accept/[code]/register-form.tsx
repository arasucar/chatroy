"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";

interface Props {
  code: string;
  targetEmail: string | null;
}

export function RegisterForm({ code, targetEmail }: Props) {
  const boundAction = registerAction.bind(null, code);
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    boundAction,
    null,
  );

  return (
    <>
      {state?.rateLimited && (
        <p style={{ color: "var(--accent)", marginBottom: "1rem" }}>
          Too many attempts. Try again later.
        </p>
      )}
      {state?.error && (
        <p style={{ color: "var(--accent)", marginBottom: "1rem" }}>{state.error}</p>
      )}

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            defaultValue={targetEmail ?? ""}
            readOnly={!!targetEmail}
            autoComplete="email"
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span>Display name</span>
          <input
            name="displayName"
            type="text"
            autoComplete="name"
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
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
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </>
  );
}
