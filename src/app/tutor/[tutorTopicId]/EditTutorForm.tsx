"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateTutorTopic } from "./actions";

// Gated by the caller to the same "can manage this tutor" audience as
// MaterialsManager (see page.tsx's `canManage`) — admin, this course's
// instructor, or any instructor/admin for a topic-bound tutor. Prior to
// this, a tutor's name and system prompt were fixed at creation time
// with no way to fix a typo or rework the persona/instructions later.
export function EditTutorForm({
  tutorTopicId,
  name,
  systemPrompt,
}: {
  tutorTopicId: string;
  name: string;
  systemPrompt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateTutorTopic(tutorTopicId, new FormData(e.currentTarget));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Edit tutor settings
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Edit tutor settings</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Close
        </button>
      </div>

      <label className={labelClass}>
        Name
        <input name="name" defaultValue={name} required className={inputClass} />
      </label>

      <label className={labelClass}>
        System prompt / persona instructions
        <textarea
          name="systemPrompt"
          defaultValue={systemPrompt}
          required
          rows={10}
          className={inputClass}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && !saving && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
