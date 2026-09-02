import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getCourseById } from "@/lib/courses";
import { createTutorTopic } from "@/app/tutor/actions";
import { CreateTeamsForm } from "../CreateTeamsForm";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

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
  const canManage = isInstructor || isAdmin;

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

  const teams = [
    ...course.gameSessions.map((s) => ({
      id: s.id,
      slug: s.game.slug,
      name: s.game.name,
      status: s.status,
      joinCode: s.joinCode,
      playerCount: `${s.participants.length}/4`,
      metricLabel: "Total cost",
      metric:
        s.status === "COMPLETED"
          ? `$${s.roundStates.reduce((sum, r) => sum + r.cost, 0).toFixed(2)}`
          : null,
      createdAt: s.createdAt,
    })),
    ...course.newsvendorSessions.map((s) => ({
      id: s.id,
      slug: s.game.slug,
      name: s.game.name,
      status: s.status,
      joinCode: s.joinCode,
      playerCount: `${s.participants.length}`,
      metricLabel: "Avg profit",
      metric:
        s.status === "COMPLETED"
          ? `$${average(s.results.map((r) => r.profit)).toFixed(2)}`
          : null,
      createdAt: s.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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

      {canManage ? (
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

          <div className="mt-6">
            <CreateTeamsForm courseId={course.id} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Taught by {course.instructor.name ?? course.instructor.email}.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Teams ({teams.length})
        </h2>
        {teams.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            No teams created for this course yet.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-zinc-500 dark:text-zinc-500">
                <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                  Game
                </th>
                <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                  Status
                </th>
                <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                  Players
                </th>
                {canManage && (
                  <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                    Join code
                  </th>
                )}
                <th className="border-b border-zinc-200 pb-1 text-right font-normal dark:border-zinc-700">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                    <Link
                      href={`/games/${t.slug}/sessions/${t.id}`}
                      className="underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                    {t.status}
                  </td>
                  <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                    {t.playerCount}
                  </td>
                  {canManage && (
                    <td className="py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {t.joinCode}
                    </td>
                  )}
                  <td className="py-1.5 text-right text-zinc-900 dark:text-zinc-50">
                    {t.metric ? `${t.metricLabel}: ${t.metric}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          AI Tutors
        </h2>
        {course.tutorTopics.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            No tutors for this course yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {course.tutorTopics.map((t) => (
              <li key={t.id}>
                <Link href={`/tutor/${t.id}`} className="text-sm text-zinc-700 underline dark:text-zinc-300">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            action={createTutorTopic}
            className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800"
          >
            <input type="hidden" name="courseId" value={course.id} />
            <input
              name="name"
              placeholder="Tutor name (e.g. Bruce the Goose)"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
            <textarea
              name="systemPrompt"
              placeholder="System prompt / persona instructions"
              required
              rows={6}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
            <button
              type="submit"
              className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Create tutor
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
