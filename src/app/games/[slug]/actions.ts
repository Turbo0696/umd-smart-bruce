"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { addParticipant } from "@/lib/games";
import { prisma } from "@/lib/prisma";

function randomJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createSession(gameSlug: string) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a game session.");
  }

  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) {
    throw new Error("Game not found.");
  }

  let session;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      session = await prisma.gameSession.create({
        data: {
          gameId: game.id,
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

  redirect(`/games/${gameSlug}/sessions/${session!.id}`);
}

export async function joinSessionByCode(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be logged in to join a session.");
  }

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    throw new Error("Enter a join code.");
  }

  const session = await prisma.gameSession.findUnique({
    where: { joinCode: code },
    include: { game: true },
  });
  if (!session) {
    throw new Error("No session found with that code.");
  }

  if (session.status === "PENDING") {
    // Best-effort: if the session is full or some other state issue
    // prevents joining, still send them to the session page — its own
    // PENDING/ACTIVE/COMPLETED views communicate the outcome.
    try {
      await addParticipant(session.id, profile.id);
    } catch {
      // fall through to redirect regardless
    }
  }

  redirect(`/games/${session.game.slug}/sessions/${session.id}`);
}
