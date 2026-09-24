"use client";

import { useState } from "react";
import { resetUserPassword } from "./actions";

export function ResetPasswordButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setState("saving");
    setError(null);
    try {
      await resetUserPassword(email);
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    }
  }

  if (state === "sent") {
    return <span className="text-xs text-emerald-600 dark:text-emerald-400">Email sent</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "saving"}
        className="text-xs font-medium text-zinc-600 underline decoration-dotted hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        {state === "saving" ? "Sending…" : "Reset password"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
