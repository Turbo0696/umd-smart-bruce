import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const tutors = await prisma.tutorTopic.findMany({
    include: { topic: true, course: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 md:flex-row md:items-center">
        <div className="flex flex-1 flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Meet Bruce, your course guide (deploy test)
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
            autoPlay
            muted
            playsInline
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          AI Tutors
        </h2>
        {tutors.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            No tutors have been created yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tutors.map((t) => (
              <Link
                key={t.id}
                href={`/tutor/${t.id}`}
                className="flex items-center gap-4 rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <Image
                  src="/images/bruce-tutor.png"
                  alt=""
                  width={500}
                  height={530}
                  className="h-24 w-auto shrink-0 -scale-x-100"
                />
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {t.name}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {t.topic ? t.topic.name : t.course?.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
