"use client";

import { useState } from "react";
import { DeleteTutorButton } from "./DeleteTutorButton";
import { EditTutorForm } from "./EditTutorForm";
import { MaterialsManager } from "./MaterialsManager";

type Material = {
  id: string;
  fileName: string;
  status: "PENDING" | "READY" | "FAILED";
  errorMessage: string | null;
};

// Single collapsed entry point for everything about managing a tutor —
// renaming it or rewriting the prompt, its materials, and (admin-only)
// deleting it — rather than three separate always-on boxes on the page.
// Gated by the caller to the same "can manage this tutor" audience as
// each section it contains (see page.tsx's `canManage`); the danger
// zone inside is further restricted to `isAdmin`.
export function TutorSettingsPanel({
  tutorTopicId,
  name,
  systemPrompt,
  provider,
  maizeyProjectId,
  hasMaizeyApiToken,
  materials,
  isAdmin,
}: {
  tutorTopicId: string;
  name: string;
  systemPrompt: string | null;
  provider: "CUSTOM_RAG" | "MAIZEY";
  maizeyProjectId: string | null;
  hasMaizeyApiToken: boolean;
  materials: Material[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Tutor settings
      </button>
    );
  }

  return (
    <div className="mt-6 flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <div className="flex items-center justify-between p-5 pb-3">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Tutor settings</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Close
        </button>
      </div>

      <div className="p-5">
        <EditTutorForm
          tutorTopicId={tutorTopicId}
          name={name}
          systemPrompt={systemPrompt}
          provider={provider}
          maizeyProjectId={maizeyProjectId}
          hasMaizeyApiToken={hasMaizeyApiToken}
        />
      </div>

      {provider === "CUSTOM_RAG" && (
        <div className="p-5">
          <MaterialsManager tutorTopicId={tutorTopicId} materials={materials} />
        </div>
      )}

      {isAdmin && (
        <div className="p-5">
          <DeleteTutorButton tutorTopicId={tutorTopicId} tutorName={name} />
        </div>
      )}
    </div>
  );
}
