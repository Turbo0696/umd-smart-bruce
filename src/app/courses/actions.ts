"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function randomJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createCourse(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a course.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const term = String(formData.get("term") ?? "").trim();
  const topicId = String(formData.get("topicId") ?? "").trim();

  if (!name) throw new Error("Course name is required.");
  if (!term) throw new Error("Term is required.");

  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) throw new Error("Unknown topic.");

  let course;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      course = await prisma.course.create({
        data: {
          name,
          term,
          topicId: topic.id,
          instructorId: profile.id,
          joinCode: randomJoinCode(),
        },
      });
      break;
    } catch (err) {
      // Unique constraint collision on joinCode — extremely unlikely, just retry.
      if (attempt === 4) throw err;
    }
  }

  redirect(`/courses/${course!.id}`);
}

export async function joinCourseByCode(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be logged in to join a course.");
  }

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    throw new Error("Enter a join code.");
  }

  const course = await prisma.course.findUnique({ where: { joinCode: code } });
  if (!course) {
    throw new Error("No course found with that code.");
  }

  await prisma.enrollment.upsert({
    where: { courseId_userId: { courseId: course.id, userId: profile.id } },
    update: {},
    create: { courseId: course.id, userId: profile.id },
  });

  redirect(`/courses/${course.id}`);
}
