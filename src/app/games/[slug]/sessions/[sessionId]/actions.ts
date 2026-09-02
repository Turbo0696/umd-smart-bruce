"use server";

import { revalidatePath } from "next/cache";
import {
  ROLE_ORDER,
  resolveRound,
  type BeerGameRole,
  type RoundStateByRole,
} from "@/lib/beerGame";
import { getCurrentProfile } from "@/lib/auth";
import { addParticipant } from "@/lib/games";
import { prisma } from "@/lib/prisma";

function sessionPath(gameSlug: string, sessionId: string) {
  return `/games/${gameSlug}/sessions/${sessionId}`;
}

export async function joinAsParticipant(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to join.");

  await addParticipant(sessionId, profile.id);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function startSession(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.gameSession.findUnique({
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

  await prisma.gameSession.update({
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

  const session = await prisma.gameSession.findUnique({
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

  await prisma.pendingOrder.upsert({
    where: { participantId_round: { participantId: participant.id, round } },
    update: { amount },
    create: { sessionId, participantId: participant.id, round, amount },
  });

  const pending = await prisma.pendingOrder.findMany({
    where: { sessionId, round },
  });

  if (pending.length === session.participants.length) {
    // Two players submitting their last order at nearly the same instant
    // could both observe the full set and race to resolve the round; the
    // unique (participantId, round) constraint on GameRoundState rejects
    // the loser rather than double-writing, which is fine here — the
    // round is already correctly resolved by the winner.
    try {
      await resolveAndAdvance(session.id, round, session.totalRounds);
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
) {
  const [participants, pastRounds, pending] = await Promise.all([
    prisma.gameParticipant.findMany({ where: { sessionId } }),
    prisma.gameRoundState.findMany({
      where: { sessionId, round: { gte: round - 2, lt: round } },
    }),
    prisma.pendingOrder.findMany({ where: { sessionId, round } }),
  ]);

  const participantByRole = new Map(participants.map((p) => [p.role, p]));
  const roleByParticipantId = new Map(participants.map((p) => [p.id, p.role]));

  const history = new Map<number, RoundStateByRole>();
  for (const row of pastRounds) {
    const bucket = history.get(row.round) ?? ({} as RoundStateByRole);
    bucket[row.role] = {
      round: row.round,
      inventory: row.inventory,
      backlog: row.backlog,
      shipped: row.shipped,
      outgoingOrder: row.outgoingOrder,
    };
    history.set(row.round, bucket);
  }

  // A role with no participant (short-handed team) never has a
  // PendingOrder, so it's simply absent here — resolveRound treats a
  // missing entry as "auto-order what was received."
  const orders: Partial<Record<BeerGameRole, number>> = {};
  for (const order of pending) {
    const role = roleByParticipantId.get(order.participantId);
    if (role) orders[role] = order.amount;
  }

  const resolved = resolveRound(round, history, orders);

  await prisma.$transaction([
    prisma.gameRoundState.createMany({
      data: ROLE_ORDER.map((role) => ({
        sessionId,
        participantId: participantByRole.get(role)?.id ?? null,
        role,
        round,
        ...resolved[role],
      })),
    }),
    prisma.pendingOrder.deleteMany({ where: { sessionId, round } }),
    prisma.gameSession.update({
      where: { id: sessionId },
      data:
        round >= totalRounds
          ? { status: "COMPLETED", completedAt: new Date() }
          : { currentRound: round + 1 },
    }),
  ]);
}
