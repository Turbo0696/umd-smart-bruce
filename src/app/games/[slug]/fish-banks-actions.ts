"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DEFAULT_CONFIG, type FishBanksConfig } from "@/lib/fishBanks";
import { addFishBanksParticipant } from "@/lib/fishBanksGames";
import { prisma } from "@/lib/prisma";

function randomJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createFishBanksSession(gameSlug: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a fleet.");
  }

  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) {
    throw new Error("Game not found.");
  }

  const courseId = String(formData.get("courseId") ?? "").trim() || undefined;

  const totalRounds = clampInt(formData.get("totalRounds"), DEFAULT_CONFIG.totalRounds, 1, 60);
  const startingCash = clampNum(formData.get("startingCash"), DEFAULT_CONFIG.startingCash, 0);
  const startingShips = clampInt(formData.get("startingShips"), DEFAULT_CONFIG.startingShips, 1, 20);

  const config: FishBanksConfig = {
    ...DEFAULT_CONFIG,
    totalRounds,
    startingCash,
    startingShips,
  };

  let session;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      session = await prisma.fishBanksSession.create({
        data: {
          gameId: game.id,
          instructorId: profile.id,
          courseId,
          joinCode: randomJoinCode(),
          totalRounds: config.totalRounds,
          coastalStock: config.startingCoastalStock,
          deepSeaStock: config.startingDeepSeaStock,
          config: config as unknown as object,
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

export async function joinFishBanksSessionByCode(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be logged in to join a fleet.");
  }

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    throw new Error("Enter a join code.");
  }

  const session = await prisma.fishBanksSession.findUnique({
    where: { joinCode: code },
    include: { game: true },
  });
  if (!session) {
    throw new Error("No fleet found with that code.");
  }

  if (session.status === "PENDING") {
    // Best-effort: if some state issue prevents joining, still send them
    // to the session page — its PENDING/ACTIVE/COMPLETED views communicate
    // the outcome.
    try {
      await addFishBanksParticipant(session.id, profile.id);
    } catch {
      // fall through to redirect regardless
    }
  }

  redirect(`/games/${session.game.slug}/sessions/${session.id}`);
}

function clampInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNum(value: FormDataEntryValue | null, fallback: number, min: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}
