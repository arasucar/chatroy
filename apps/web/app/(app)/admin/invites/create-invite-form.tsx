"use client";

import { useActionState } from "react";
import { createInviteAction, type CreateInviteState } from "./actions";

export function CreateInviteForm() {
  const [state, formAction, pending] = useActionState<CreateInviteState, FormData>(
    createInviteAction,
    null,
  );

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
      {state?.error && <p style={{ color: "var(--accent)" }}>{state.error}</p>}

      {state?.inviteUrl && (
        <div style={{ padding: "0.75rem", background: "var(--surface-strong)", borderRadius: 4 }}>
          <p style={{ marginBottom: "0.5rem", fontSize: "0.875rem" }}>Invite link (copy and send):</p>
          <code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{state.inviteUrl}</code>
        </div>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Email (optional — leave blank for open invite)</span>
        <input name="email" type="email" style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Role</span>
        <select name="role" defaultValue="member" style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Expires in (days)</span>
        <input name="expiryDays" type="number" min={1} max={30} defaultValue={7}
          style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 4 }} />
      </label>

      <button type="submit" disabled={pending}
        style={{ padding: "0.6rem 1.2rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, cursor: pending ? "not-allowed" : "pointer" }}>
        {pending ? "Creating…" : "Create invite"}
      </button>
    </form>
  );
}
