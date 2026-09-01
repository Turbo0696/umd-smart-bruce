import Link from "next/link";
import { listTopics } from "@/lib/topics";

export default async function TopicsPage() {
  const topics = await listTopics();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Topics
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <Link
            key={topic.slug}
            href={`/topics/${topic.slug}`}
            className="rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
              {topic.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {topic.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
