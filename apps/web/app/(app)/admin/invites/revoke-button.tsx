"use client";

import { useTransition } from "react";
import { revokeInviteAction } from "./actions";

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => revokeInviteAction(inviteId))}
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.2rem 0.6rem",
        cursor: pending ? "not-allowed" : "pointer",
        fontSize: "0.8rem",
      }}
    >
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}
