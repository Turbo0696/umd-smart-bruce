import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "SMART Hub | Decision Sciences & Supply Chain Management",
  description:
    "A bulletin board, simulation games, and AI tutors for Decision Sciences and Supply Chain Management courses.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <header className="border-b border-zinc-200">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              SMART Hub
            </Link>
            <div className="flex gap-6 text-sm font-medium text-zinc-600">
              <Link href="/topics" className="hover:text-zinc-900">
                Topics
              </Link>
              <Link
                href="/topics/decision-sciences"
                className="hover:text-zinc-900"
              >
                Decision Sciences
              </Link>
              <Link
                href="/topics/supply-chain-management"
                className="hover:text-zinc-900"
              >
                Supply Chain Management
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
          SMART Hub — built for Decision Sciences &amp; Supply Chain
          Management courses.
        </footer>
      </body>
    </html>
  );
}
