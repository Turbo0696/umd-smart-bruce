"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DEFAULT_NEGOTIATION_CONFIG, MAX_HORIZON_MONTHS, type NegotiationConfig } from "@/lib/negotiation";
import { addNegotiationParticipant } from "@/lib/negotiationGames";
import { prisma } from "@/lib/prisma";

function randomJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createNegotiationSession(gameSlug: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "INSTRUCTOR" && profile.role !== "ADMIN")) {
    throw new Error("Only instructors can create a session.");
  }

  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) {
    throw new Error("Game not found.");
  }

  const courseId = String(formData.get("courseId") ?? "").trim() || undefined;
  const config = parseConfigFromForm(formData);

  let session;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      session = await prisma.negotiationSession.create({
        data: {
          gameId: game.id,
          instructorId: profile.id,
          courseId,
          joinCode: randomJoinCode(),
          totalRounds: config.totalRounds,
          roundDeadlineAt: null,
          config: config as unknown as object,
        },
      });
      break;
    } catch (err) {
      // Only retry the actual thing this loop exists for — a unique
      // constraint collision on joinCode (extremely unlikely). Any other
      // error (e.g. a stale/invalid courseId hitting the foreign key) would
      // just fail the same way 5 times in a row; surface it immediately.
      if (!isP2002(err) || attempt === 4) throw err;
    }
  }

  redirect(`/games/${gameSlug}/sessions/${session!.id}`);
}

function isP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export async function joinNegotiationByCode(formData: FormData) {
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

  const session = await prisma.negotiationSession.findUnique({
    where: { joinCode: code },
    include: { game: true },
  });
  if (!session) {
    throw new Error("No session found with that code.");
  }

  if (session.status === "PENDING") {
    // Best-effort: if some state issue prevents joining, still send them to
    // the session page — its PENDING/ACTIVE/COMPLETED views communicate the
    // outcome.
    try {
      await addNegotiationParticipant(session.id, profile.id);
    } catch {
      // fall through to redirect regardless
    }
  }
  // An ACTIVE session's own "Claim a bot seat" control (on the session page)
  // handles enrolling a late joiner — a join code alone isn't enough context
  // to pick which bot seat to hand them.

  redirect(`/games/${session.game.slug}/sessions/${session.id}`);
}

function parseConfigFromForm(formData: FormData): NegotiationConfig {
  const horizonLabels = parseCsvList(formData.get("horizonLabels"), DEFAULT_NEGOTIATION_CONFIG.horizonLabels);
  const monthlyDemandRaw = parseCsvNumberList(
    formData.get("monthlyDemand"),
    DEFAULT_NEGOTIATION_CONFIG.monthlyDemand,
  );

  // The two lists must describe the same horizon. If a host botches one of
  // them, fall back to the shorter list's length rather than guessing.
  const n = Math.max(1, Math.min(horizonLabels.length, monthlyDemandRaw.length, MAX_HORIZON_MONTHS));
  const labels = horizonLabels.slice(0, n);
  const demand = monthlyDemandRaw.slice(0, n).map((v) => Math.max(0, Math.round(v)));

  return {
    horizonLabels: labels,
    monthlyDemand: demand,
    retailPrice: clampNum(formData.get("retailPrice"), DEFAULT_NEGOTIATION_CONFIG.retailPrice, 0),
    salvagePrice: clampNum(formData.get("salvagePrice"), DEFAULT_NEGOTIATION_CONFIG.salvagePrice, 0),
    retailerOrderCost: clampNum(formData.get("retailerOrderCost"), DEFAULT_NEGOTIATION_CONFIG.retailerOrderCost, 0),
    retailerHoldingCost: clampNum(
      formData.get("retailerHoldingCost"),
      DEFAULT_NEGOTIATION_CONFIG.retailerHoldingCost,
      0,
    ),
    manufacturerCost: clampNum(formData.get("manufacturerCost"), DEFAULT_NEGOTIATION_CONFIG.manufacturerCost, 0),
    wholesalerOrderCost: clampNum(
      formData.get("wholesalerOrderCost"),
      DEFAULT_NEGOTIATION_CONFIG.wholesalerOrderCost,
      0,
    ),
    wholesalerHoldingCost: clampNum(
      formData.get("wholesalerHoldingCost"),
      DEFAULT_NEGOTIATION_CONFIG.wholesalerHoldingCost,
      0,
    ),
    wholesalerSalvage: clampNum(
      formData.get("wholesalerSalvage"),
      DEFAULT_NEGOTIATION_CONFIG.wholesalerSalvage,
      0,
    ),
    totalRounds: clampInt(formData.get("totalRounds"), DEFAULT_NEGOTIATION_CONFIG.totalRounds, 1, 10),
    roundMinutes: parseOptionalMinutes(formData.get("roundMinutes")),
    allowDemandSharing: formData.get("allowDemandSharing") !== null,
    allowNotes: formData.get("allowNotes") !== null,
    noteMaxLength: DEFAULT_NEGOTIATION_CONFIG.noteMaxLength,
    maxMonthlyQty: DEFAULT_NEGOTIATION_CONFIG.maxMonthlyQty,
  };
}

function parseCsvList(value: FormDataEntryValue | null, fallback: string[]): string[] {
  const parsed = String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function parseCsvNumberList(value: FormDataEntryValue | null, fallback: number[]): number[] {
  const parsed = String(value ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return parsed.length > 0 ? parsed : fallback;
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

// Blank stays "no limit" (null). A present value is clamped to 1..1440
// (24h) — unlike totalRounds' clampInt, a bare finite-and-positive check
// let an absurd value (e.g. a pasted 1e15) through, which overflows
// ECMAScript's valid Date range downstream in roundDeadlineFrom and throws
// on write. See negotiation.ts's roundDeadlineFrom for the second half of
// this guard.
function parseOptionalMinutes(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 1440);
}
