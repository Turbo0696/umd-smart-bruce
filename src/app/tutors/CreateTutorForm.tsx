"use client";

import { useState } from "react";
import Link from "next/link";
import { createTutorTopic } from "@/app/tutor/actions";

export function CreateTutorForm({
  topics,
  instructorCourses,
}: {
  topics: { id: string; name: string }[];
  instructorCourses: { id: string; name: string; term: string }[];
}) {
  const [bindTo, setBindTo] = useState<"topic" | "course">("topic");
  const [provider, setProvider] = useState<"CUSTOM_RAG" | "MAIZEY">("CUSTOM_RAG");

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <form
      action={createTutorTopic}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Create a tutor
      </h2>

      <label className={labelClass}>
        Name
        <input
          name="name"
          placeholder="Tutor name (e.g. Bruce the Goose)"
          required
          className={inputClass}
        />
      </label>

      <textarea
        name="systemPrompt"
        placeholder="System prompt / persona instructions"
        required
        rows={6}
        className={inputClass}
      />

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
            Upload materials here
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="provider"
              value="MAIZEY"
              checked={provider === "MAIZEY"}
              onChange={() => setProvider("MAIZEY")}
            />
            Use an existing Maizey project
          </label>
        </div>
        {provider === "MAIZEY" ? (
          <label className={labelClass}>
            Maizey project ID
            <input
              name="maizeyProjectId"
              placeholder="e.g. 42"
              required
              className={inputClass}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              Chat forwards straight to that Maizey project — its own knowledge
              base and retrieval, not materials uploaded here.
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Attach this tutor to
        </span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="bindTo"
              checked={bindTo === "topic"}
              onChange={() => setBindTo("topic")}
            />
            A topic (open to everyone)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="bindTo"
              checked={bindTo === "course"}
              onChange={() => setBindTo("course")}
              disabled={instructorCourses.length === 0}
            />
            A course you teach (roster only)
          </label>
        </div>
      </div>

      {bindTo === "topic" ? (
        <select name="topicId" required className={inputClass}>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      ) : instructorCourses.length > 0 ? (
        <select name="courseId" required className={inputClass}>
          {instructorCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.term}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          You don&apos;t teach any courses yet — create one on the{" "}
          <Link href="/courses" className="underline">
            Courses
          </Link>{" "}
          page first.
        </p>
      )}

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Create tutor
      </button>
    </form>
  );
}
