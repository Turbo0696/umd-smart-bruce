"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Simple polling so waiting players see round resolution / new joins
// without manually reloading. No Supabase Realtime channel for this
// MVP — a session has at most 4 players, so a few-second poll interval
// is plenty responsive at this scale and keeps things simple.
export function PollingRefresher({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
