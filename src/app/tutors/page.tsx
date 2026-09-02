import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { listCoursesForInstructor } from "@/lib/courses";
import { listTopics } from "@/lib/topics";
import { prisma } from "@/lib/prisma";
import { CreateTutorForm } from "./CreateTutorForm";

export default async function TutorsPage() {
  const profile = await getCurrentProfile();
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";

  const [tutors, topics, instructorCourses] = await Promise.all([
    prisma.tutorTopic.findMany({
      include: { topic: true, course: true },
      orderBy: { createdAt: "desc" },
    }),
    canCreate ? listTopics() : Promise.resolve([]),
    canCreate && profile ? listCoursesForInstructor(profile.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        AI Tutors
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Tutors only answer from materials their instructor has uploaded —
        attached to a topic (open to everyone) or a course (roster only).
      </p>

      {canCreate && (
        <div className="mt-6">
          <CreateTutorForm topics={topics} instructorCourses={instructorCourses} />
        </div>
      )}

      <div className="mt-8">
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
                  className="h-20 w-auto shrink-0 -scale-x-100"
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
      </div>
    </div>
  );
}
