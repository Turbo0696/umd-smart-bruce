import Link from "next/link";
import { topics } from "@/lib/topics";

export default function TopicsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Topics</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <Link
            key={topic.slug}
            href={`/topics/${topic.slug}`}
            className="rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400"
          >
            <h2 className="font-semibold text-zinc-900">{topic.name}</h2>
            <p className="mt-1 text-sm text-zinc-600">{topic.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
