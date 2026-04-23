"use client";

import { useTransition } from "react";
import { changeRoleAction } from "./actions";
import type { AppRole } from "@roy/shared";

export function RoleToggle({ userId, currentRole }: { userId: string; currentRole: AppRole }) {
  const [pending, startTransition] = useTransition();
  const nextRole: AppRole = currentRole === "admin" ? "member" : "admin";

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => changeRoleAction(userId, nextRole))}
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.2rem 0.6rem",
        cursor: pending ? "not-allowed" : "pointer",
        fontSize: "0.8rem",
      }}
    >
      {pending ? "Saving…" : `Make ${nextRole}`}
    </button>
  );
}
