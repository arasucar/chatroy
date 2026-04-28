"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--tp-surface-lowest)" }}>
      <header className="tp-topbar">
        <span className="tp-wordmark">CHATROY</span>
        <span className="tp-mono">Local Engine</span>
      </header>

      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "72px 16px 24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            border: "1px solid var(--tp-outline-var)",
            position: "relative",
            padding: 32,
            background: "var(--tp-surface-lowest)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "var(--tp-primary)",
            }}
          />

          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: "32px",
              margin: "0 0 4px",
            }}
          >
            Authenticate
          </h1>
          <p className="tp-mono" style={{ margin: "0 0 24px" }}>
            Access the local engine via secure protocol.
          </p>

          {state?.rateLimited && (
            <p className="tp-error-msg">Too many attempts. Try again in 15 minutes.</p>
          )}
          {state?.error && <p className="tp-error-msg">{state.error}</p>}

          <form action={formAction}>
            <label className="tp-field">
              <span className="tp-field-label">Identity_Email</span>
              <input
                className="tp-input"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="user@internal"
              />
            </label>

            <label className="tp-field" style={{ marginTop: 16 }}>
              <span className="tp-field-label">Access_Key</span>
              <input
                className="tp-input"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••"
              />
            </label>

            <button
              className="tp-btn tp-btn-primary"
              type="submit"
              disabled={pending}
              style={{ width: "100%", marginTop: 24, padding: 12 }}
            >
              {pending ? "Connecting…" : "Establish Connection"}
            </button>
          </form>

          <div
            style={{
              marginTop: 32,
              paddingTop: 16,
              borderTop: "1px solid var(--tp-outline-var)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div className="tp-chip">
              <div className="tp-chip-dot" />
              Local Engine Online
            </div>
            <span className="tp-mono">0.0.0.0:11434</span>
          </div>
        </div>
      </main>
    </div>
  );
}
