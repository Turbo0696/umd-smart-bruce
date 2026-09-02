"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findOrInviteUser } from "@/lib/userAdmin";

async function requireCourseManager(courseId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found.");

  if (course.instructorId !== profile.id && profile.role !== "ADMIN") {
    throw new Error("Only this course's instructor can manage its roster.");
  }

  return { profile, course };
}

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

export async function addStudentToCourse(courseId: string, formData: FormData) {
  const { course } = await requireCourseManager(courseId);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) throw new Error("Email is required.");

  const student = await findOrInviteUser(email, "STUDENT");

  await prisma.enrollment.upsert({
    where: { courseId_userId: { courseId: course.id, userId: student.id } },
    update: {},
    create: { courseId: course.id, userId: student.id },
  });

  revalidatePath(`/courses/${courseId}`);
}

export async function removeStudentFromCourse(courseId: string, userId: string) {
  await requireCourseManager(courseId);

  await prisma.enrollment.deleteMany({ where: { courseId, userId } });

  revalidatePath(`/courses/${courseId}`);
}

async function createOneTeam(
  gameSlug: string,
  courseId: string,
  instructorId: string,
  newsvendorParams: {
    price: number;
    cost: number;
    salvage: number;
    demandMin: number;
    demandMax: number;
    totalRounds: number;
  },
) {
  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) throw new Error("Game not found.");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (gameSlug === "beer-game") {
        await prisma.gameSession.create({
          data: { gameId: game.id, instructorId, courseId, joinCode: randomJoinCode() },
        });
      } else {
        await prisma.newsvendorSession.create({
          data: { gameId: game.id, instructorId, courseId, joinCode: randomJoinCode(), ...newsvendorParams },
        });
      }
      return;
    } catch (err) {
      // Unique constraint collision on joinCode — extremely unlikely, just retry.
      if (attempt === 4) throw err;
    }
  }
}

export async function createTeams(courseId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create teams.");
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found.");
  if (course.instructorId !== profile.id && profile.role !== "ADMIN") {
    throw new Error("Only this course's instructor can create teams.");
  }

  const gameSlug = String(formData.get("gameSlug") ?? "");
  if (gameSlug !== "beer-game" && gameSlug !== "newsvendor") {
    throw new Error("Unknown game.");
  }

  const count = Number(formData.get("count"));
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("Number of teams must be between 1 and 50.");
  }

  const newsvendorParams = {
    price: Number(formData.get("price") ?? 5),
    cost: Number(formData.get("cost") ?? 2),
    salvage: Number(formData.get("salvage") ?? 0),
    demandMin: Number(formData.get("demandMin") ?? 10),
    demandMax: Number(formData.get("demandMax") ?? 50),
    totalRounds: Number(formData.get("totalRounds") ?? 8),
  };

  for (let i = 0; i < count; i++) {
    await createOneTeam(gameSlug, courseId, profile.id, newsvendorParams);
  }

  redirect(`/courses/${courseId}`);
}
