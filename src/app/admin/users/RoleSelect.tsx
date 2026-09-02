"use client";

import { useState } from "react";
import { updateUserRole } from "./actions";

const ROLES = ["STUDENT", "INSTRUCTOR", "ADMIN"] as const;

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [current, setCurrent] = useState(role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError(null);
    try {
      await updateUserRole(userId, next);
    } catch (err) {
      setCurrent(previous);
      setError(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
