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
      {state?.error && <p className="tp-error-msg">{state.error}</p>}

      {state?.inviteUrl && (
        <div className="tp-section" style={{ padding: 12 }}>
          <p className="tp-field-label" style={{ margin: "0 0 8px" }}>
            Invite Link
          </p>
          <code className="tp-code-inline" style={{ wordBreak: "break-all" }}>
            {state.inviteUrl}
          </code>
        </div>
      )}

      <label className="tp-field">
        <span className="tp-field-label">Email (Optional)</span>
        <input className="tp-input" name="email" type="email" />
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Role</span>
        <select className="tp-select" name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <label className="tp-field">
        <span className="tp-field-label">Expires In (Days)</span>
        <input className="tp-input" name="expiryDays" type="number" min={1} max={30} defaultValue={7} />
      </label>

      <button className="tp-btn tp-btn-primary" type="submit" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Creating…" : "Create invite"}
      </button>
    </form>
  );
}
