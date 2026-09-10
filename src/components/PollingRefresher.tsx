"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Simple polling so waiting players see round resolution / new joins without
// manually reloading. No Supabase Realtime channel yet — a poll is responsive
// enough and keeps things simple.
//
// Note on scale: a Beer Game session is now a whole class rather than a single
// team of four, so a 50-student lecture means ~13 clients re-rendering a server
// component every few seconds. That is still modest, but it is the first place
// to look if a large session feels sluggish — either lengthen `intervalMs` for
// the host console or move this to a Realtime subscription.
export function PollingRefresher({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
