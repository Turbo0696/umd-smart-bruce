// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Input guards ported from siemsene/beergame: negative orders become 0, and an
// unusually large order asks for confirmation because "sometimes players
// accidentally double-tap a key". See NOTICE.md for attribution.

"use client";

import { useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { LARGE_ORDER_CONFIRM_THRESHOLD } from "@/lib/beerGameConfig";

function SubmitButton({
  onGuard,
}: {
  onGuard: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={onGuard}
      className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Submitting…" : "Submit order"}
    </button>
  );
}

export function OrderForm({
  action,
  round,
  defaultValue,
}: {
  action: (formData: FormData) => void | Promise<void>;
  round: number;
  defaultValue: number;
}) {
  const [value, setValue] = useState(String(defaultValue));

  // Strip anything that could produce a negative number as it is typed, so the
  // field can never show a value the server would silently rewrite.
  function handleChange(next: string) {
    setValue(next.replace(/-/g, ""));
  }

  function guard(event: MouseEvent<HTMLButtonElement>) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      event.preventDefault();
      setValue("0");
      return;
    }

    if (parsed >= LARGE_ORDER_CONFIRM_THRESHOLD) {
      const ok = window.confirm(
        `You're ordering ${Math.round(parsed)} units — a lot more than usual. Submit anyway?`,
      );
      if (!ok) event.preventDefault();
    }
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Your order for round {round}
        <input
          type="number"
          name="amount"
          min={0}
          step={1}
          required
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
      <SubmitButton onGuard={guard} />
    </form>
  );
}
