"use client";

import { useTransition } from "react";
import { changeRoleAction } from "./actions";
import type { AppRole } from "@roy/shared";

export function RoleToggle({ userId, currentRole }: { userId: string; currentRole: AppRole }) {
  const [pending, startTransition] = useTransition();
  const nextRole: AppRole = currentRole === "admin" ? "member" : "admin";

  return (
    <button
      className="tp-btn tp-btn-ghost tp-btn-sm"
      disabled={pending}
      onClick={() => startTransition(() => changeRoleAction(userId, nextRole))}
      type="button"
    >
      {pending ? "Saving…" : `Make ${nextRole}`}
    </button>
  );
}
