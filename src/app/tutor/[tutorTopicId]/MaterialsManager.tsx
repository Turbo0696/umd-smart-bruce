"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createUploadUrl, deleteMaterial, processUploadedMaterial, reindexMaterial } from "./actions";

const STORAGE_BUCKET = "tutor-materials";

type Material = {
  id: string;
  fileName: string;
  status: "PENDING" | "READY" | "FAILED";
  errorMessage: string | null;
};

export function MaterialsManager({
  tutorTopicId,
  materials,
}: {
  tutorTopicId: string;
  materials: Material[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      // The file itself goes straight from the browser to Supabase
      // Storage via a signed URL — it never passes through our own
      // server action's request body, which Vercel caps around 4.5MB
      // (far too small for a real slide deck).
      const { storagePath, token, fileType } = await createUploadUrl(tutorTopicId, file.name);

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(storagePath, token, file);
      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      await processUploadedMaterial(tutorTopicId, storagePath, file.name, fileType);
      formRef.current?.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleReindex(materialId: string) {
    setBusyId(materialId);
    setError(null);
    try {
      await reindexMaterial(tutorTopicId, materialId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(materialId: string) {
    setBusyId(materialId);
    setError(null);
    try {
      await deleteMaterial(tutorTopicId, materialId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Materials
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        The tutor only answers from these documents — .txt, .docx, .pptx, or .pdf.
      </p>

      {materials.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 text-zinc-700 dark:text-zinc-300">{m.fileName}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-500">
                  {m.status}
                  {m.status === "FAILED" && m.errorMessage && (
                    <span className="ml-1 text-red-600 dark:text-red-400">
                      ({m.errorMessage})
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => handleReindex(m.id)}
                    disabled={busyId === m.id}
                    className="mr-3 text-zinc-700 underline disabled:opacity-50 dark:text-zinc-300"
                  >
                    Reindex
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={busyId === m.id}
                    className="text-red-600 underline disabled:opacity-50 dark:text-red-400"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form ref={formRef} onSubmit={handleUpload} className="mt-4 flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".txt,.docx,.pptx,.pdf"
          required
          disabled={uploading}
          className="text-sm text-zinc-700 dark:text-zinc-300"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
