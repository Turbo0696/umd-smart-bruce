"use client";

import { useEffect, useState } from "react";

// Purely a display — nothing here resolves a round or stage on its own.
// There is no cron/realtime in this app, so a deadline that passes is a
// signal for a host to act on (see the negotiation game's "Resolve
// everything stalled right now"), not something the client can enforce.
//
// `deadline` is an ISO string rather than a Date: passing a Date object
// straight from a Server Component into a Client Component's props relies
// on React's Flight serialization supporting it, which this repo has no
// other precedent for — a string sidesteps the question entirely.
export function CountdownTimer({ deadline, label }: { deadline: string; label: string }) {
  const target = new Date(deadline).getTime();
  // `now` is state, updated once a second from inside the effect's own
  // subscription callback (setInterval) — never read via a direct
  // Date.now() call in the render body, which React's purity rule flags as
  // an impure render. Render only ever computes target - now, both of
  // which are ordinary render inputs (a prop and a state value).
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // An unparseable deadline makes target NaN, and NaN <= 0 is false — so
  // without this check it would fall straight into the "time left" branch
  // below and render "NaN:NaN" instead of failing visibly.
  if (!Number.isFinite(target)) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">Time left for {label}: —</p>;
  }

  const remainingMs = target - now;

  if (remainingMs <= 0) {
    return (
      <p
        className="text-sm font-medium text-rose-600 dark:text-rose-400"
        suppressHydrationWarning
      >
        Time&apos;s up for {label} — nothing happens automatically, so ask
        your instructor to move things along.
      </p>
    );
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const runningLow = remainingMs < 30_000;

  return (
    <p
      className={
        runningLow
          ? "text-sm font-medium text-amber-600 dark:text-amber-400"
          : "text-sm font-medium text-zinc-700 dark:text-zinc-300"
      }
      // The server and the client each compute their own `now` a moment
      // apart (this page isn't cached — it's re-rendered per request), so
      // the very first paint can show a slightly different second than
      // what hydration computes. That's expected for a live clock — see
      // the Next.js docs' own "Date updates live (countdown timers,
      // clocks)" guidance — and this is exactly the case it names.
      suppressHydrationWarning
    >
      Time left for {label}: {minutes}:{seconds.toString().padStart(2, "0")}
    </p>
  );
}
