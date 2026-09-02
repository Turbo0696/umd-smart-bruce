import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { listCoursesForInstructor, listCoursesForStudent } from "@/lib/courses";
import { listTopics } from "@/lib/topics";
import { createCourse, joinCourseByCode } from "./actions";

export default async function CoursesPage() {
  const profile = await getCurrentProfile();
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";

  const [topics, taughtCourses, enrolledCourses] = await Promise.all([
    canCreate ? listTopics() : Promise.resolve([]),
    profile ? listCoursesForInstructor(profile.id) : Promise.resolve([]),
    profile ? listCoursesForStudent(profile.id) : Promise.resolve([]),
  ]);

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Courses
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Instructors create a course and share its join code; students join
        with that code to be added to the roster.
      </p>

      {!profile && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to create or join a course.
        </p>
      )}

      {canCreate && (
        <form
          action={createCourse}
          className="mt-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Create a course
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Name
              <input
                name="name"
                placeholder="e.g. Operations Management"
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Term
              <input
                name="term"
                placeholder="e.g. Fall 2026"
                required
                className={inputClass}
              />
            </label>
            <label className={`${labelClass} col-span-2`}>
              Topic
              <select name="topicId" required className={inputClass}>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="mt-2 self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create course
          </button>
        </form>
      )}

      {profile && (
        <form
          action={joinCourseByCode}
          className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <label className="flex flex-col gap-1 text-sm">
            Have a join code?
            <input
              name="code"
              placeholder="e.g. AB3XQ9"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Join course
          </button>
        </form>
      )}

      {taughtCourses.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Courses you teach
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {taughtCourses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {course.name}{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-500">
                    · {course.term}
                  </span>
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {course.topic.name} · Join code{" "}
                  <span className="font-mono">{course.joinCode}</span> ·{" "}
                  {course.enrollments.length} enrolled
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {enrolledCourses.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Courses you&apos;re enrolled in
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {enrolledCourses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {course.name}{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-500">
                    · {course.term}
                  </span>
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {course.topic.name} · Taught by{" "}
                  {course.instructor.name ?? course.instructor.email}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
