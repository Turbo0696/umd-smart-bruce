"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { MaterialType } from "@prisma/client";
import { getCurrentProfile } from "@/lib/auth";
import { chunkText, extractText } from "@/lib/materialParsing";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { askTutor } from "@/lib/tutor";
import { embedAndStoreChunks, renderSystemPrompt, retrieveContext } from "@/lib/tutorRag";

// NOTE: maxDuration for this route lives in ./page.tsx, not here. A
// "use server" file may only export async functions — a plain constant
// like `export const maxDuration` breaks the whole module's export map
// (every action in this file, e.g. sendMessage, silently disappears from
// the client bundle) rather than erroring on just that line.

const STORAGE_BUCKET = "tutor-materials";

async function requireManager(tutorTopicId: string) {
  const profile = await getCurrentProfile();
  const tutor = await prisma.tutorTopic.findUnique({
    where: { id: tutorTopicId },
    include: { course: true },
  });
  if (!tutor) throw new Error("Tutor not found.");

  const isAdmin = profile?.role === "ADMIN";
  const isCourseInstructor = !!profile && tutor.course?.instructorId === profile.id;
  const isTopicManager =
    !tutor.courseId && !!profile && (profile.role === "INSTRUCTOR" || profile.role === "ADMIN");

  if (!isAdmin && !isCourseInstructor && !isTopicManager) {
    throw new Error("Only this tutor's instructor can manage it.");
  }

  return tutor;
}

const PROCESSING_TIMEOUT_MS = 60_000;

async function processMaterial(materialId: string, buffer: Buffer, fileType: MaterialType) {
  try {
    await Promise.race([
      (async () => {
        const text = await extractText(buffer, fileType);
        const chunks = chunkText(text);
        await embedAndStoreChunks(materialId, chunks);
      })(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Processing took too long (over 60s) — try a smaller or simpler file.")),
          PROCESSING_TIMEOUT_MS,
        ),
      ),
    ]);
    await prisma.tutorMaterial.update({
      where: { id: materialId },
      data: { status: "READY", errorMessage: null },
    });
  } catch (err) {
    // Deliberately outside the try above: if the failure was itself a
    // database hiccup, we still want a best-effort attempt to record
    // it rather than leaving the material stuck in PENDING forever.
    try {
      await prisma.tutorMaterial.update({
        where: { id: materialId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });
    } catch {
      // Nothing more we can do — the material will just show PENDING
      // until a manual reindex.
    }
  }
}

function detectFileType(fileName: string): MaterialType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "txt"
    ? "TXT"
    : ext === "docx"
      ? "DOCX"
      : ext === "pptx"
        ? "PPTX"
        : ext === "pdf"
          ? "PDF"
          : null;
}

// The raw file bytes never pass through this server action's own
// request body — Vercel caps that around 4.5MB, far too small for a
// real slide deck. Instead the client uploads directly to Supabase
// Storage using a short-lived signed URL from here, then calls
// processUploadedMaterial below with just the (tiny) storage path.
export async function createUploadUrl(tutorTopicId: string, fileName: string) {
  await requireManager(tutorTopicId);

  const fileType = detectFileType(fileName);
  if (!fileType) {
    throw new Error("Only .txt, .docx, .pptx, and .pdf files are supported.");
  }

  const storagePath = `${tutorTopicId}/${randomUUID()}-${fileName}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    throw new Error(`Could not prepare an upload slot: ${error?.message ?? "unknown error"}`);
  }

  return { storagePath, token: data.token, fileType };
}

export async function processUploadedMaterial(
  tutorTopicId: string,
  storagePath: string,
  fileName: string,
  fileType: MaterialType,
) {
  await requireManager(tutorTopicId);

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error("Could not download the uploaded file from storage.");
  }
  const buffer = Buffer.from(await data.arrayBuffer());

  const material = await prisma.tutorMaterial.create({
    data: { tutorTopicId, fileName, storagePath, fileType, status: "PENDING" },
  });

  await processMaterial(material.id, buffer, fileType);

  revalidatePath(`/tutor/${tutorTopicId}`);
}

export async function reindexMaterial(tutorTopicId: string, materialId: string) {
  await requireManager(tutorTopicId);

  const material = await prisma.tutorMaterial.findUnique({ where: { id: materialId } });
  if (!material || material.tutorTopicId !== tutorTopicId) {
    throw new Error("Material not found.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(material.storagePath);
  if (error || !data) {
    throw new Error("Could not re-download the file from storage.");
  }
  const buffer = Buffer.from(await data.arrayBuffer());

  await prisma.materialChunk.deleteMany({ where: { materialId } });
  await prisma.tutorMaterial.update({
    where: { id: materialId },
    data: { status: "PENDING", errorMessage: null },
  });

  await processMaterial(materialId, buffer, material.fileType);

  revalidatePath(`/tutor/${tutorTopicId}`);
}

export async function deleteMaterial(tutorTopicId: string, materialId: string) {
  await requireManager(tutorTopicId);

  const material = await prisma.tutorMaterial.findUnique({ where: { id: materialId } });
  if (!material || material.tutorTopicId !== tutorTopicId) {
    throw new Error("Material not found.");
  }

  const admin = createAdminClient();
  await admin.storage.from(STORAGE_BUCKET).remove([material.storagePath]);

  await prisma.materialChunk.deleteMany({ where: { materialId } });
  await prisma.tutorMaterial.delete({ where: { id: materialId } });

  revalidatePath(`/tutor/${tutorTopicId}`);
}

// Tag on our own so a failure here is greppable in Vercel's function logs
// without needing the (often-redacted) React digest — search this string
// plus the tutorTopicId/step it logs alongside it.
const LOG_TAG = "[tutor.sendMessage]";

export async function sendMessage(tutorTopicId: string, content: string) {
  // Wrapped end-to-end: this is the route that produced "Minified React
  // error #441" in production, whose real message Next.js redacts from
  // the client. Whatever step throws, log it here with full detail
  // *before* rethrowing, so the server-side log (not just the client's
  // redacted digest) always has the real cause.
  let step = "auth";
  try {
    const profile = await getCurrentProfile();
    if (!profile) throw new Error("You must be logged in to chat.");

    step = "load-tutor";
    const tutor = await prisma.tutorTopic.findUnique({
      where: { id: tutorTopicId },
      include: { course: { include: { enrollments: true } } },
    });
    if (!tutor) throw new Error("Tutor not found.");

    if (tutor.courseId) {
      const isInstructor = tutor.course!.instructorId === profile.id;
      const isEnrolled = tutor.course!.enrollments.some((e) => e.userId === profile.id);
      if (!isInstructor && profile.role !== "ADMIN" && !isEnrolled) {
        throw new Error("You need to join this course first.");
      }
    }

    const trimmed = content.trim();
    if (!trimmed) throw new Error("Message can't be empty.");

    step = "save-user-message";
    await prisma.chatMessage.create({
      data: { tutorTopicId, userId: profile.id, role: "USER", content: trimmed },
    });

    step = "retrieve-context";
    const context = await retrieveContext(tutorTopicId, trimmed);
    const systemPrompt = renderSystemPrompt(tutor.systemPrompt, { context, question: trimmed });

    step = "load-history";
    const history = await prisma.chatMessage.findMany({
      where: { tutorTopicId, userId: profile.id },
      orderBy: { createdAt: "asc" },
    });
    const turns = history.map((m) => ({
      role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    step = "ask-tutor";
    const reply = await askTutor(systemPrompt, turns);

    step = "save-assistant-message";
    await prisma.chatMessage.create({
      data: { tutorTopicId, userId: profile.id, role: "ASSISTANT", content: reply },
    });

    step = "revalidate";
    revalidatePath(`/tutor/${tutorTopicId}`);

    return reply;
  } catch (err) {
    console.error(
      `${LOG_TAG} failed at step="${step}" tutorTopicId=${tutorTopicId}`,
      err,
    );
    throw err;
  }
}
