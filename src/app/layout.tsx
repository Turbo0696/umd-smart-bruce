import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AuthListener } from "@/components/AuthListener";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentProfile } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bruce, the smart goose | Decision Sciences & Supply Chain Management",
  description:
    "A bulletin board, simulation games, and AI tutors for Decision Sciences and Supply Chain Management courses.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AuthListener />
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <Image
                src="/images/bruce-badge.png"
                alt=""
                width={36}
                height={36}
                className="rounded-full"
              />
              Bruce, the smart goose
            </Link>
            <div className="flex gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              <Link
                href="/"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Home
              </Link>
              <Link
                href="/topics"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Topics
              </Link>
              <Link
                href="/courses"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Courses
              </Link>
              <Link
                href="/games"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Simulations &amp; games
              </Link>
              {(profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN") && (
                <Link
                  href="/tutors"
                  className="hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                  AI Tutors
                </Link>
              )}
              {profile ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-zinc-400 dark:text-zinc-500">
                    {profile.name ?? profile.email}
                  </span>
                  <SignOutButton />
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                  Log in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-zinc-200 py-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-3 px-6 text-center sm:grid-cols-3 sm:text-left">
            <p>Dr. Wayne Fu &amp; Dr. Hung-Chun Su</p>
            <Image
              src="/images/umd-shield-transparent.png"
              alt="University of Michigan-Dearborn shield"
              width={40}
              height={32}
              className="mx-auto"
            />
            <p className="sm:text-right">
              Bruce, the smart goose — built for University of
              Michigan-Dearborn College of Business.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
