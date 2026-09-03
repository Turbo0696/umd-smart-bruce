"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteTutorTopic } from "./actions";

// Admin-only control (gated by the caller — see TutorSettingsPanel's
// `isAdmin`). Deleting a tutor wipes every student's chat history for
// it, so this asks for confirmation before calling the server action,
// unlike the single-material delete in MaterialsManager.
//
// Rendered as one section inside TutorSettingsPanel, which supplies
// the outer border/spacing — this component only owns its own content.
export function DeleteTutorButton({
  tutorTopicId,
  tutorName,
}: {
  tutorTopicId: string;
  tutorName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${tutorName}"? This permanently removes it, its materials, and every student's chat history with it. This can't be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteTutorTopic(tutorTopicId);
      router.push("/tutors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <div>
      <h2 className="font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Permanently delete this tutor, its materials, and all chat history with it.
      </p>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="mt-3 rounded-full border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        {deleting ? "Deleting…" : "Delete tutor"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
