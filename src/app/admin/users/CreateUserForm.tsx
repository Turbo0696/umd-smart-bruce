"use client";

import { useRef, useState } from "react";
import { createUser } from "./actions";

export function CreateUserForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createUser(formData);
      setSuccess(`Invited ${formData.get("email")}.`);
      formRef.current?.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Add a user
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        If they don&apos;t have an account yet, we&apos;ll email them an
        invite to set a password.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className={inputClass}
        />
        <input name="name" placeholder="Name (optional)" className={inputClass} />
        <select name="role" defaultValue="STUDENT" className={inputClass}>
          <option value="STUDENT">Student</option>
          <option value="INSTRUCTOR">Instructor</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "Adding…" : "Add user"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
    </form>
  );
}
