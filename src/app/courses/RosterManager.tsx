"use client";

import { useRef, useState } from "react";
import { addStudentToCourse, removeStudentFromCourse } from "./actions";

type Enrollment = {
  id: string;
  userId: string;
  createdAt: string;
  user: { name: string | null; email: string };
};

export function RosterManager({
  courseId,
  enrollments,
}: {
  courseId: string;
  enrollments: Enrollment[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setAdding(true);
    setError(null);
    try {
      await addStudentToCourse(courseId, formData);
      formRef.current?.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add student.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      await removeStudentFromCourse(courseId, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove student.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Roster ({enrollments.length})
      </h2>
      {enrollments.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
          No students enrolled yet.
        </p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                  {e.user.name ?? e.user.email}
                </td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-500">
                  Joined {new Date(e.createdAt).toLocaleDateString()}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => handleRemove(e.userId)}
                    disabled={busyUserId === e.userId}
                    className="text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        ref={formRef}
        onSubmit={handleAdd}
        className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800"
      >
        <input
          name="email"
          type="email"
          placeholder="Student email"
          required
          disabled={adding}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
