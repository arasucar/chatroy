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
        <p className="tp-error-msg">
          Too many attempts. Try again later.
        </p>
      )}
      {state?.error && (
        <p className="tp-error-msg">{state.error}</p>
      )}

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label className="tp-field">
          <span className="tp-field-label">Email</span>
          <input
            className="tp-input"
            name="email"
            type="email"
            required
            defaultValue={targetEmail ?? ""}
            readOnly={!!targetEmail}
            autoComplete="email"
          />
        </label>

        <label className="tp-field">
          <span className="tp-field-label">Display Name</span>
          <input
            className="tp-input"
            name="displayName"
            type="text"
            autoComplete="name"
          />
        </label>

        <label className="tp-field">
          <span className="tp-field-label">Password</span>
          <input
            className="tp-input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        <button
          className="tp-btn tp-btn-primary"
          type="submit"
          disabled={pending}
          style={{ width: "100%", padding: 12 }}
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </>
  );
}
