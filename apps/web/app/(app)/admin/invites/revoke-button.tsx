"use client";

import { useTransition } from "react";
import { revokeInviteAction } from "./actions";

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="tp-btn tp-btn-danger tp-btn-sm"
      disabled={pending}
      onClick={() => startTransition(() => revokeInviteAction(inviteId))}
      type="button"
    >
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}
