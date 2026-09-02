"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { addNewsvendorParticipant } from "@/lib/newsvendorGames";
import { prisma } from "@/lib/prisma";

function randomJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createNewsvendorSession(
  gameSlug: string,
  formData: FormData,
) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a competition.");
  }

  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) {
    throw new Error("Game not found.");
  }

  const price = Number(formData.get("price"));
  const cost = Number(formData.get("cost"));
  const salvage = Number(formData.get("salvage"));
  const demandMin = Number(formData.get("demandMin"));
  const demandMax = Number(formData.get("demandMax"));
  const totalRounds = Number(formData.get("totalRounds"));

  if (
    [price, cost, salvage, demandMin, demandMax, totalRounds].some(
      (n) => !Number.isFinite(n),
    )
  ) {
    throw new Error("All parameters must be numbers.");
  }
  if (price <= cost) throw new Error("Price must be greater than cost.");
  if (demandMax < demandMin) {
    throw new Error("Max demand must be at least min demand.");
  }
  if (totalRounds < 1) throw new Error("Need at least 1 round.");

  const courseId = String(formData.get("courseId") ?? "").trim() || undefined;

  let session;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      session = await prisma.newsvendorSession.create({
        data: {
          gameId: game.id,
          instructorId: profile.id,
          courseId,
          joinCode: randomJoinCode(),
          price,
          cost,
          salvage,
          demandMin,
          demandMax,
          totalRounds,
        },
      });
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }

  redirect(`/games/${gameSlug}/sessions/${session!.id}`);
}

export async function joinNewsvendorSessionByCode(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be logged in to join a competition.");
  }

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    throw new Error("Enter a join code.");
  }

  const session = await prisma.newsvendorSession.findUnique({
    where: { joinCode: code },
    include: { game: true },
  });
  if (!session) {
    throw new Error("No competition found with that code.");
  }

  if (session.status === "PENDING") {
    try {
      await addNewsvendorParticipant(session.id, profile.id);
    } catch {
      // fall through to redirect regardless
    }
  }

  redirect(`/games/${session.game.slug}/sessions/${session.id}`);
}
