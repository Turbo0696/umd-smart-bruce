"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import {
  resolveFishBanksRound,
  type FishBanksConfig,
  type TeamDecision,
  type TeamStateBefore,
} from "@/lib/fishBanks";
import { addFishBanksParticipant, configFromSession } from "@/lib/fishBanksGames";
import { prisma } from "@/lib/prisma";

function sessionPath(gameSlug: string, sessionId: string) {
  return `/games/${gameSlug}/sessions/${sessionId}`;
}

export async function joinAsParticipant(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to join.");

  await addFishBanksParticipant(sessionId, profile.id);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function startSession(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.fishBanksSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Fleet not found.");

  const canManage =
    profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the instructor can start this fleet.");
  if (session.participants.length < 1) {
    throw new Error("Need at least 1 team before starting.");
  }

  await prisma.fishBanksSession.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });

  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function submitDecision(
  gameSlug: string,
  sessionId: string,
  formData: FormData,
) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.fishBanksSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Fleet not found.");
  if (session.status !== "ACTIVE") throw new Error("This fleet is not active.");

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not a team in this fleet.");

  const decision: TeamDecision = {
    shipsCoastal: nonNegInt(formData.get("shipsCoastal")),
    shipsDeepSea: nonNegInt(formData.get("shipsDeepSea")),
    buildShips: nonNegInt(formData.get("buildShips")),
    scrapShips: nonNegInt(formData.get("scrapShips")),
  };

  const round = session.currentRound;

  await prisma.fishBanksPendingDecision.upsert({
    where: { participantId_round: { participantId: participant.id, round } },
    update: decision,
    create: { sessionId, participantId: participant.id, round, ...decision },
  });

  const pending = await prisma.fishBanksPendingDecision.findMany({
    where: { sessionId, round },
  });

  if (pending.length === session.participants.length) {
    try {
      await resolveAndAdvance(session.id, round, session.totalRounds, configFromSession(session));
    } catch (err) {
      // Race with another concurrent submit crossing the same threshold —
      // the unique (participantId, round) constraint on FishBanksTeamRound
      // rejects a losing concurrent resolver rather than double-writing.
      const isDuplicate =
        typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
      if (!isDuplicate) throw err;
    }
  }

  revalidatePath(sessionPath(gameSlug, sessionId));
}

// Instructor-only escape hatch: resolves the round right now, defaulting
// any team that hasn't submitted to "repeat last round's allocation, no
// build/scrap" (or an even coastal/deep-sea split on round 1) — the same
// "null strategy" fallback the Beer Game uses for short-handed roles.
export async function forceResolveRound(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.fishBanksSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Fleet not found.");
  if (session.status !== "ACTIVE") throw new Error("This fleet is not active.");

  const canManage =
    profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the instructor can force-resolve a round.");

  const round = session.currentRound;
  const pending = await prisma.fishBanksPendingDecision.findMany({ where: { sessionId, round } });
  const submitted = new Set(pending.map((p) => p.participantId));
  const missing = session.participants.filter((p) => !submitted.has(p.id));

  if (missing.length > 0) {
    const fallbacks = await defaultDecisionsFor(sessionId, round, missing);
    await prisma.fishBanksPendingDecision.createMany({
      data: missing.map((p) => ({
        sessionId,
        participantId: p.id,
        round,
        ...fallbacks.get(p.id)!,
      })),
    });
  }

  await resolveAndAdvance(session.id, round, session.totalRounds, configFromSession(session));

  revalidatePath(sessionPath(gameSlug, sessionId));
}

async function defaultDecisionsFor(
  sessionId: string,
  round: number,
  missing: { id: string; ships: number }[],
): Promise<Map<string, TeamDecision>> {
  const result = new Map<string, TeamDecision>();
  if (round > 1) {
    const priorRows = await prisma.fishBanksTeamRound.findMany({
      where: { sessionId, round: round - 1, participantId: { in: missing.map((p) => p.id) } },
    });
    const byParticipant = new Map(priorRows.map((r) => [r.participantId, r]));
    for (const p of missing) {
      const prior = byParticipant.get(p.id);
      result.set(p.id, {
        shipsCoastal: prior?.shipsCoastal ?? Math.ceil(p.ships / 2),
        shipsDeepSea: prior?.shipsDeepSea ?? Math.floor(p.ships / 2),
        buildShips: 0,
        scrapShips: 0,
      });
    }
  } else {
    for (const p of missing) {
      result.set(p.id, {
        shipsCoastal: Math.ceil(p.ships / 2),
        shipsDeepSea: Math.floor(p.ships / 2),
        buildShips: 0,
        scrapShips: 0,
      });
    }
  }
  return result;
}

async function resolveAndAdvance(
  sessionId: string,
  round: number,
  totalRounds: number,
  config: FishBanksConfig,
) {
  const [session, pending] = await Promise.all([
    prisma.fishBanksSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { participants: true },
    }),
    prisma.fishBanksPendingDecision.findMany({ where: { sessionId, round } }),
  ]);

  const pendingByParticipant = new Map(pending.map((p) => [p.participantId, p]));

  const teams: TeamStateBefore[] = session.participants.map((p) => {
    const d = pendingByParticipant.get(p.id);
    return {
      id: p.id,
      cash: p.cash,
      ships: p.ships,
      decision: {
        shipsCoastal: d?.shipsCoastal ?? 0,
        shipsDeepSea: d?.shipsDeepSea ?? 0,
        buildShips: d?.buildShips ?? 0,
        scrapShips: d?.scrapShips ?? 0,
      },
    };
  });

  const outcome = resolveFishBanksRound(teams, session.coastalStock, session.deepSeaStock, config);
  const isLastRound = round >= totalRounds;

  await prisma.$transaction([
    prisma.fishBanksTeamRound.createMany({
      data: outcome.teams.map((t) => ({
        sessionId,
        participantId: t.id,
        round,
        shipsCoastal: t.shipsCoastal,
        shipsDeepSea: t.shipsDeepSea,
        shipsBuilt: t.shipsBuilt,
        shipsScrapped: t.shipsScrapped,
        catchCoastal: t.catchCoastal,
        catchDeepSea: t.catchDeepSea,
        revenue: t.revenue,
        operatingCost: t.operatingCost,
        buildCost: t.buildCost,
        scrapRevenue: t.scrapRevenue,
        interest: t.interest,
        profit: t.profit,
        cash: t.cash,
        ships: t.ships,
        netWorth: t.netWorth,
      })),
    }),
    prisma.fishBanksMarketRound.create({
      data: {
        sessionId,
        round,
        coastalStock: outcome.market.coastalStock,
        deepSeaStock: outcome.market.deepSeaStock,
        price: outcome.market.price,
        totalCatch: outcome.market.totalCatch,
      },
    }),
    ...outcome.teams.map((t) =>
      prisma.fishBanksParticipant.update({
        where: { id: t.id },
        data: { cash: t.cash, ships: t.ships },
      }),
    ),
    prisma.fishBanksPendingDecision.deleteMany({ where: { sessionId, round } }),
    prisma.fishBanksSession.update({
      where: { id: sessionId },
      data: isLastRound
        ? {
            status: "COMPLETED",
            completedAt: new Date(),
            coastalStock: outcome.market.coastalStock,
            deepSeaStock: outcome.market.deepSeaStock,
          }
        : {
            currentRound: round + 1,
            coastalStock: outcome.market.coastalStock,
            deepSeaStock: outcome.market.deepSeaStock,
          },
    }),
  ]);
}

function nonNegInt(value: FormDataEntryValue | null): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
