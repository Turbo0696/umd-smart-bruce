import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getCourseById } from "@/lib/courses";

export default async function CourseDetailPage(props: PageProps<"/courses/[id]">) {
  const { id } = await props.params;
  const [course, profile] = await Promise.all([
    getCourseById(id),
    getCurrentProfile(),
  ]);

  if (!course) {
    notFound();
  }

  const isInstructor = profile?.id === course.instructorId;
  const isAdmin = profile?.role === "ADMIN";
  const isEnrolled = course.enrollments.some((e) => e.userId === profile?.id);
  const canSeeRoster = isInstructor || isAdmin;

  if (!isInstructor && !isAdmin && !isEnrolled) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {course.name}
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          You need to join this course with its code first.
        </p>
        <Link
          href="/courses"
          className="mt-4 inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          Go to Courses
        </Link>
      </div>
    );
  }

  const linkedSessions = [
    ...course.gameSessions.map((s) => ({
      id: s.id,
      slug: s.game.slug,
      name: s.game.name,
      status: s.status,
    })),
    ...course.newsvendorSessions.map((s) => ({
      id: s.id,
      slug: s.game.slug,
      name: s.game.name,
      status: s.status,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {course.name}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {course.term} ·{" "}
        <Link href={`/topics/${course.topic.slug}`} className="underline">
          {course.topic.name}
        </Link>
      </p>

      {canSeeRoster ? (
        <>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Join code:{" "}
            <span className="font-mono font-medium text-zinc-900 dark:text-zinc-50">
              {course.joinCode}
            </span>
          </p>

          <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
              Roster ({course.enrollments.length})
            </h2>
            {course.enrollments.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                No students enrolled yet.
              </p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {course.enrollments.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                        {e.user.name ?? e.user.email}
                      </td>
                      <td className="py-1.5 text-right text-zinc-500 dark:text-zinc-500">
                        Joined {e.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Taught by {course.instructor.name ?? course.instructor.email}.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Game sessions for this course
        </h2>
        {linkedSessions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            No sessions linked to this course yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {linkedSessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/games/${s.slug}/sessions/${s.id}`}
                  className="text-sm text-zinc-700 underline dark:text-zinc-300"
                >
                  {s.name} — {s.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
