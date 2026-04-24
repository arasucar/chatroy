"use client";

import { useTransition } from "react";
import { setSearchEnabledAction } from "./actions";

export function SearchToggle({
  userId,
  searchEnabled,
}: {
  userId: string;
  searchEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setSearchEnabledAction(userId, !searchEnabled))}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.35rem 0.75rem",
        background: "transparent",
        cursor: pending ? "not-allowed" : "pointer",
        fontSize: "0.875rem",
      }}
    >
      {pending ? "Saving…" : searchEnabled ? "Disable search" : "Enable search"}
    </button>
  );
}
