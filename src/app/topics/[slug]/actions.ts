"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createPost(topicSlug: string, formData: FormData) {
  const profile = await getCurrentProfile();

  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can post to the bulletin board.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const pinned = formData.get("pinned") === "on";

  if (!title || !body) {
    throw new Error("Title and body are required.");
  }

  const topic = await prisma.topic.findUnique({ where: { slug: topicSlug } });
  if (!topic) {
    throw new Error("Topic not found.");
  }

  await prisma.post.create({
    data: {
      title,
      body,
      pinned,
      topicId: topic.id,
      authorId: profile.id,
    },
  });

  revalidatePath(`/topics/${topicSlug}`);
}
