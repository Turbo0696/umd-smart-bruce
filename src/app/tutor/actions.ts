"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Shared by the "Create a tutor" forms on both /topics/[slug] (sets
// topicId) and /courses/[id] (sets courseId) — a tutor binds to
// exactly one of the two, never both.
export async function createTutorTopic(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a tutor.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const systemPrompt = String(formData.get("systemPrompt") ?? "").trim();
  const topicId = String(formData.get("topicId") ?? "").trim() || undefined;
  const courseId = String(formData.get("courseId") ?? "").trim() || undefined;
  // Custom RAG (our own materials) is the default; Maizey forks the
  // whole tutor out to an existing Maizey project instead — see
  // src/lib/maizey.ts.
  const provider = formData.get("provider") === "MAIZEY" ? "MAIZEY" : "CUSTOM_RAG";
  const maizeyProjectId = String(formData.get("maizeyProjectId") ?? "").trim() || undefined;

  if (!name) throw new Error("Tutor name is required.");
  if (!systemPrompt) throw new Error("System prompt is required.");
  if (!topicId && !courseId) {
    throw new Error("A tutor must be tied to a topic or a course.");
  }
  if (topicId && courseId) {
    throw new Error("A tutor can't be tied to both a topic and a course.");
  }
  if (provider === "MAIZEY" && !maizeyProjectId) {
    throw new Error("A Maizey project ID is required for a Maizey-backed tutor.");
  }

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new Error("Course not found.");
    if (course.instructorId !== profile.id && profile.role !== "ADMIN") {
      throw new Error("Only this course's instructor can create a tutor for it.");
    }
  }

  const tutor = await prisma.tutorTopic.create({
    data: {
      name,
      systemPrompt,
      topicId,
      courseId,
      provider,
      maizeyProjectId: provider === "MAIZEY" ? maizeyProjectId : undefined,
    },
  });

  redirect(`/tutor/${tutor.id}`);
}
