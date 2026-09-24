"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Reached only via a Supabase recovery link: /auth/confirm exchanges the
// email link's `code` for a session server-side and redirects here, so by
// the time this page loads the browser already has a valid session — we
// just need to check for it (an expired/reused link never reaches this
// page with a session) and let the user pick a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="mx-auto w-full max-w-sm px-6 py-16">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Checking your link…</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto w-full max-w-sm px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Link expired
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          This password reset link is invalid or has expired. Ask an admin to
          send you a new one, or go back to{" "}
          <a href="/login" className="font-medium text-zinc-900 underline dark:text-zinc-50">
            log in
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Set a new password
      </h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Confirm password
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}
