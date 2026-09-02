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
  const linkClass = "hover:text-zinc-900 dark:hover:text-zinc-50";

  const brand = (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <Image src="/images/bruce-badge.png" alt="" width={36} height={36} className="rounded-full" />
      Bruce, the smart goose
    </Link>
  );

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="sm:hidden"
        >
          <HamburgerIcon open={open} />
        </button>

        <div className="hidden sm:block">{brand}</div>
        <div className="hidden gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400 sm:flex sm:items-center">
          <Link href="/" className={linkClass}>Home</Link>
          <Link href="/topics" className={linkClass}>Topics</Link>
          <Link href="/courses" className={linkClass}>Courses</Link>
          <Link href="/games" className={linkClass}>Simulations &amp; games</Link>
          {canManageTutors && (
            <Link href="/tutors" className={linkClass}>AI Tutors</Link>
          )}
          {profile ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-zinc-400 dark:text-zinc-500">{profile.name ?? profile.email}</span>
              <SignOutButton />
            </div>
          ) : (
            <Link href="/login" className={linkClass}>Log in</Link>
          )}
        </div>

        <div className="sm:hidden">{brand}</div>
      </nav>

      {open && (
        <div className="flex flex-col gap-4 border-t border-zinc-200 px-6 py-4 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 sm:hidden">
          <Link href="/" className={linkClass} onClick={() => setOpen(false)}>Home</Link>
          <Link href="/topics" className={linkClass} onClick={() => setOpen(false)}>Topics</Link>
          <Link href="/courses" className={linkClass} onClick={() => setOpen(false)}>Courses</Link>
          <Link href="/games" className={linkClass} onClick={() => setOpen(false)}>Simulations &amp; games</Link>
          {canManageTutors && (
            <Link href="/tutors" className={linkClass} onClick={() => setOpen(false)}>AI Tutors</Link>
          )}
          {profile ? (
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <span className="text-zinc-400 dark:text-zinc-500">{profile.name ?? profile.email}</span>
              <SignOutButton />
            </div>
          ) : (
            <Link href="/login" className={linkClass} onClick={() => setOpen(false)}>Log in</Link>
          )}
        </div>
      )}
    </header>
  );
}
