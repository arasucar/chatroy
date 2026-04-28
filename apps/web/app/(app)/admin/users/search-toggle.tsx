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
      className="tp-btn tp-btn-ghost tp-btn-sm"
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setSearchEnabledAction(userId, !searchEnabled))}
    >
      {pending ? "Saving…" : searchEnabled ? "Disable search" : "Enable search"}
    </button>
  );
}
