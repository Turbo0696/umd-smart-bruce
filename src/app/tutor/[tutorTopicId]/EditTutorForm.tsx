"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateTutorTopic } from "./actions";

// Rendered as one section inside TutorSettingsPanel, which supplies the
// outer toggle, border, and spacing — this component only owns its own
// form and save logic.
export function EditTutorForm({
  tutorTopicId,
  name,
  systemPrompt,
  provider: initialProvider,
  maizeyProjectId,
}: {
  tutorTopicId: string;
  name: string;
  systemPrompt: string;
  provider: "CUSTOM_RAG" | "MAIZEY";
  maizeyProjectId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState(initialProvider);

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">General</h2>

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

      <div className="flex flex-col gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Knowledge base
        </span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="provider"
              value="CUSTOM_RAG"
              checked={provider === "CUSTOM_RAG"}
              onChange={() => setProvider("CUSTOM_RAG")}
            />
            Materials uploaded here
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="provider"
              value="MAIZEY"
              checked={provider === "MAIZEY"}
              onChange={() => setProvider("MAIZEY")}
            />
            An existing Maizey project
          </label>
        </div>
        {provider === "MAIZEY" ? (
          <label className={labelClass}>
            Maizey project ID
            <input
              name="maizeyProjectId"
              defaultValue={maizeyProjectId ?? ""}
              placeholder="e.g. 42"
              required
              className={inputClass}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              Chat forwards straight to that Maizey project instead of running
              retrieval over materials uploaded here.
            </span>
          </label>
        ) : null}
      </div>

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
