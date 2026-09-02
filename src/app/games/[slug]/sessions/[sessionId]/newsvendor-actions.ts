"use server";

import { revalidatePath } from "next/cache";
import { drawDemand, resolveOrder, type NewsvendorParams } from "@/lib/newsvendor";
import { getCurrentProfile } from "@/lib/auth";
import { addNewsvendorParticipant } from "@/lib/newsvendorGames";
import { prisma } from "@/lib/prisma";

function sessionPath(gameSlug: string, sessionId: string) {
  return `/games/${gameSlug}/sessions/${sessionId}`;
}

export async function joinAsParticipant(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to join.");

  await addNewsvendorParticipant(sessionId, profile.id);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function startSession(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.newsvendorSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Team not found.");

  const canManage =
    profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the team's instructor can start it.");
  if (session.participants.length < 1) {
    throw new Error("Need at least 1 player before starting.");
  }

  await prisma.newsvendorSession.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });

  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function submitOrder(
  gameSlug: string,
  sessionId: string,
  formData: FormData,
) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.newsvendorSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Team not found.");
  if (session.status !== "ACTIVE") throw new Error("This team is not active.");

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not a participant in this team.");

  const amount = Number(formData.get("amount"));
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Order must be a non-negative whole number.");
  }

  const round = session.currentRound;

  await prisma.newsvendorPendingOrder.upsert({
    where: { participantId_round: { participantId: participant.id, round } },
    update: { amount },
    create: { sessionId, participantId: participant.id, round, amount },
  });

  const pending = await prisma.newsvendorPendingOrder.findMany({
    where: { sessionId, round },
  });

  if (pending.length === session.participants.length) {
    // See src/app/games/[slug]/sessions/[sessionId]/actions.ts (Beer Game)
    // for the same race-condition rationale: the unique
    // (participantId, round) constraint on NewsvendorRoundResult rejects
    // a losing concurrent resolver rather than double-writing.
    try {
      await resolveAndAdvance(session.id, round, session.totalRounds, {
        price: session.price,
        cost: session.cost,
        salvage: session.salvage,
        demandMin: session.demandMin,
        demandMax: session.demandMax,
      });
    } catch (err) {
      const isDuplicate =
        typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
      if (!isDuplicate) throw err;
    }
  }

  revalidatePath(sessionPath(gameSlug, sessionId));
}

async function resolveAndAdvance(
  sessionId: string,
  round: number,
  totalRounds: number,
  params: NewsvendorParams,
) {
  const pending = await prisma.newsvendorPendingOrder.findMany({
    where: { sessionId, round },
  });

  const demand = drawDemand(params);

  await prisma.$transaction([
    prisma.newsvendorRoundResult.createMany({
      data: pending.map((order) => {
        const result = resolveOrder(order.amount, demand, params);
        return {
          sessionId,
          participantId: order.participantId,
          round,
          orderQty: order.amount,
          ...result,
        };
      }),
    }),
    prisma.newsvendorPendingOrder.deleteMany({ where: { sessionId, round } }),
    prisma.newsvendorSession.update({
      where: { id: sessionId },
      data:
        round >= totalRounds
          ? { status: "COMPLETED", completedAt: new Date() }
          : { currentRound: round + 1 },
    }),
  ]);
}
