"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/confirm?next=/reset-password`
          : undefined,
    });

    setLoading(false);

    // Don't reveal whether the email is registered — always show the
    // same "check your email" state, same as signup's confirmation.
    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-sm px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          If <strong>{email}</strong> has an account, we&apos;ve sent a link
          to reset the password. Click it, then come back and log in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send you a link to set a new
        password.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/login"
          className="font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
