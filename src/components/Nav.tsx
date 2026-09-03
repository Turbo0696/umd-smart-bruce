"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

type NavProfile = { name: string | null; email: string; role: string } | null;

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" role="img" aria-hidden="true">
      {open ? (
        <path
          d="M6 6 L18 18 M18 6 L6 18"
          className="stroke-zinc-900 dark:stroke-zinc-50"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" className="stroke-zinc-900 dark:stroke-zinc-50" strokeWidth={2} strokeLinecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" className="stroke-zinc-900 dark:stroke-zinc-50" strokeWidth={2} strokeLinecap="round" />
          <line x1="4" y1="17" x2="20" y2="17" className="stroke-zinc-900 dark:stroke-zinc-50" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Nav({ profile }: { profile: NavProfile }) {
  const [open, setOpen] = useState(false);
  const canManageTutors = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const isAdmin = profile?.role === "ADMIN";
  const linkClass = "hover:text-zinc-900 dark:hover:text-zinc-50";

  function close() {
    setOpen(false);
  }

  return (
    <header className="relative border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <HamburgerIcon open={open} />
        </button>

        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          onClick={close}
        >
          <Image src="/images/bruce-badge.png" alt="" width={36} height={36} className="rounded-full" />
          Bruce, the smart goose
        </Link>
      </nav>

      {open && (
        <>
          {/* Invisible click-catcher: tapping anywhere outside the popover closes it. */}
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            aria-hidden="true"
          />
          {/* A small popover anchored directly under the hamburger/X button —
              left-6 lines up with that button's position (px-6 on the nav
              above), sized to its content rather than stretching across or
              down the whole screen. */}
          <div
            className="absolute left-6 top-full z-50 mt-2 flex w-64 max-w-[85vw] flex-col gap-4 rounded-xl
                       border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-600 shadow-xl
                       dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
          >
            <Link href="/" className={linkClass} onClick={close}>Home</Link>
            <Link href="/topics" className={linkClass} onClick={close}>Topics</Link>
            <Link href="/courses" className={linkClass} onClick={close}>Courses</Link>
            <Link href="/games" className={linkClass} onClick={close}>Simulations &amp; games</Link>
            {canManageTutors && (
              <Link href="/tutors" className={linkClass} onClick={close}>AI Tutors</Link>
            )}
            {isAdmin && (
              <Link href="/admin/users" className={linkClass} onClick={close}>Admin</Link>
            )}
            {profile ? (
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <span className="text-zinc-400 dark:text-zinc-500">{profile.name ?? profile.email}</span>
                <SignOutButton />
              </div>
            ) : (
              <Link href="/login" className={linkClass} onClick={close}>Log in</Link>
            )}
          </div>
        </>
      )}
    </header>
  );
}
