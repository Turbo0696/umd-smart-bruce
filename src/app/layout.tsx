import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Bruce, the smart goose
            </Link>
            <div className="flex gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              <Link
                href="/topics"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Topics
              </Link>
              <Link
                href="/games"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Games
              </Link>
              {profile ? (
                <div className="flex items-center gap-4">
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
        <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          Bruce, the smart goose — built for Decision Sciences &amp; Supply
          Chain Management courses.
        </footer>
      </body>
    </html>
  );
}
