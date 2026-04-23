"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "2rem" }}>
        <h1 style={{ marginBottom: "1.5rem", fontSize: "1.5rem" }}>Sign in to roy</h1>

        {state?.rateLimited && (
          <p style={{ color: "var(--accent)", marginBottom: "1rem" }}>
            Too many attempts. Try again in 15 minutes.
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
              autoComplete="email"
              style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
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
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
