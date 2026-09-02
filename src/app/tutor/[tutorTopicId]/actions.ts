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

async function processMaterial(materialId: string, buffer: Buffer, fileType: MaterialType) {
  try {
    const text = await extractText(buffer, fileType);
    const chunks = chunkText(text);
    await embedAndStoreChunks(materialId, chunks);
    await prisma.tutorMaterial.update({
      where: { id: materialId },
      data: { status: "READY", errorMessage: null },
    });
  } catch (err) {
    await prisma.tutorMaterial.update({
      where: { id: materialId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}

export async function uploadMaterial(tutorTopicId: string, formData: FormData) {
  await requireManager(tutorTopicId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  const fileType: MaterialType | null =
    ext === "txt" ? "TXT" : ext === "docx" ? "DOCX" : ext === "pptx" ? "PPTX" : null;
  if (!fileType) {
    throw new Error("Only .txt, .docx, and .pptx files are supported.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${tutorTopicId}/${randomUUID()}-${file.name}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const material = await prisma.tutorMaterial.create({
    data: { tutorTopicId, fileName: file.name, storagePath, fileType, status: "PENDING" },
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

export async function sendMessage(tutorTopicId: string, content: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to chat.");

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

  await prisma.chatMessage.create({
    data: { tutorTopicId, userId: profile.id, role: "USER", content: trimmed },
  });

  const context = await retrieveContext(tutorTopicId, trimmed);
  const systemPrompt = renderSystemPrompt(tutor.systemPrompt, { context, question: trimmed });

  const history = await prisma.chatMessage.findMany({
    where: { tutorTopicId, userId: profile.id },
    orderBy: { createdAt: "asc" },
  });
  const turns = history.map((m) => ({
    role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  const reply = await askTutor(systemPrompt, turns);

  await prisma.chatMessage.create({
    data: { tutorTopicId, userId: profile.id, role: "ASSISTANT", content: reply },
  });

  revalidatePath(`/tutor/${tutorTopicId}`);
  return reply;
}
