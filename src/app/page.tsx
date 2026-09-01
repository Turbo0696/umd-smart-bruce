import Image from "next/image";
import Link from "next/link";
import { listTopics } from "@/lib/topics";

export default async function Home() {
  const topics = await listTopics();

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 md:flex-row md:items-center">
        <div className="flex flex-1 flex-col gap-4">
          <Image
            src="/images/bruce-seal.png"
            alt="Bruce the Goose seal, est. 1959"
            width={110}
            height={110}
          />
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Meet Bruce, your course guide
          </h1>
          <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
            Bruce, the smart goose, brings together course announcements,
            simulation games, and AI tutors for course subjects including
            Decision Sciences and Supply Chain Management.
          </p>
        </div>
        <div className="flex-1">
          <video
            className="w-full rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800"
            src="/video/bruce-greeting.mp4"
            controls
            playsInline
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Topics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {topics.map((topic) => (
            <Link
              key={topic.slug}
              href={`/topics/${topic.slug}`}
              className="rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                {topic.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {topic.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
