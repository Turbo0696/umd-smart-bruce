// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Beer Game session lifecycle. The host controls (draw the cohort at start,
// swap a stuck player out for Beer-GPT, end the game early) follow
// siemsene/beergame's HostLobby. See NOTICE.md for attribution.

"use server";

import { revalidatePath } from "next/cache";
import {
  ROLE_ORDER,
  resolveRound,
  type BeerGameRole,
  type RoundStateByRole,
} from "@/lib/beerGame";
import {
  TOTAL_ROUNDS_MAX,
  clampTotalRounds,
  parseBeerConfig,
} from "@/lib/beerGameConfig";
import { assignTeams } from "@/lib/beerGameTeams";
import { getCurrentProfile } from "@/lib/auth";
import { addParticipant } from "@/lib/games";
import { prisma } from "@/lib/prisma";

function sessionPath(gameSlug: string, sessionId: string) {
  return `/games/${gameSlug}/sessions/${sessionId}`;
}

/** Loads a session and asserts the caller may run the room. */
async function requireHost(sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new Error("Session not found.");

  const canManage =
    !!profile &&
    (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) {
    throw new Error("Only the session's instructor can do that.");
  }
  return { session, profile: profile! };
}

export async function joinAsParticipant(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to join.");

  await addParticipant(sessionId, profile.id);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/**
 * Host edits the game parameters. Only before the game starts — changing the
 * cost of holding stock halfway through would invalidate the history already
 * recorded against the old numbers.
 */
export async function updateBeerConfig(
  gameSlug: string,
  sessionId: string,
  formData: FormData,
) {
  const { session } = await requireHost(sessionId);
  if (session.status !== "PENDING") {
    throw new Error("Settings can only be changed before the game starts.");
  }

  // Checkboxes are absent from FormData when unchecked, so presence is the
  // signal. Reading them via parseBeerConfig's fallback would make unticking a
  // box silently keep the old value.
  const config = parseBeerConfig({
    holdingCost: formData.get("holdingCost"),
    backorderCost: formData.get("backorderCost"),
    initialInventory: formData.get("initialInventory"),
    pipelineSeed: formData.get("pipelineSeed"),
    demandInitial: formData.get("demandInitial"),
    demandFinal: formData.get("demandFinal"),
    demandStepRound: formData.get("demandStepRound"),
    extraOrderDelay: formData.get("extraOrderDelay") !== null,
    showUpstreamBacklog: formData.get("showUpstreamBacklog") !== null,
  });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { config, totalRounds: clampTotalRounds(formData.get("totalRounds")) },
  });

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/** Lobby-only: drop a duplicate sign-in before the cohort is drawn. */
export async function removeParticipant(
  gameSlug: string,
  sessionId: string,
  participantId: string,
) {
  const { session } = await requireHost(sessionId);
  if (session.status !== "PENDING") {
    throw new Error(
      "Once the game has started, use \"Replace with Beer-GPT\" instead.",
    );
  }

  await prisma.gameParticipant.delete({
    where: { id: participantId, sessionId },
  });

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/**
 * Draws the cohort and opens the game.
 *
 * Everyone on the roster is shuffled and dealt into chains of four; any seat
 * left over becomes Beer-GPT. This is the step that turns one join code into a
 * whole classroom of parallel supply chains.
 */
export async function startSession(gameSlug: string, sessionId: string) {
  const { session } = await requireHost(sessionId);
  if (session.status !== "PENDING") {
    throw new Error("This session has already started.");
  }

  const participants = await prisma.gameParticipant.findMany({
    where: { sessionId },
    select: { id: true },
    orderBy: { joinedAt: "asc" },
  });
  if (participants.length < 1) {
    throw new Error("Need at least one player before starting.");
  }

  const drafts = assignTeams(participants.map((p) => p.id));

  await prisma.$transaction(async (tx) => {
    for (const draft of drafts) {
      await tx.beerTeam.create({
        data: {
          sessionId,
          name: draft.name,
          slots: {
            create: draft.slots.map((slot) => ({
              role: slot.role,
              participantId: slot.participantId,
              isRobot: slot.participantId === null,
            })),
          },
        },
      });
    }

    await tx.gameSession.update({
      where: { id: sessionId },
      data: { status: "ACTIVE", startedAt: new Date(), currentRound: 1 },
    });
  });

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/**
 * Hands a seat to Beer-GPT.
 *
 * Covers siemsene's two real classroom cases: a student who signed in twice
 * and left a ghost blocking their team, and a student who walked out early.
 * Because the team may have been waiting only on this player, this re-checks
 * whether the round can now resolve.
 */
export async function kickToRobot(
  gameSlug: string,
  sessionId: string,
  slotId: string,
) {
  const { session } = await requireHost(sessionId);
  if (session.status !== "ACTIVE") {
    throw new Error("Players can only be replaced while the game is running.");
  }

  const slot = await prisma.beerTeamSlot.findUnique({
    where: { id: slotId },
    include: { team: true },
  });
  if (!slot || slot.team.sessionId !== sessionId) {
    throw new Error("Seat not found in this session.");
  }
  if (slot.isRobot) return; // already a robot, nothing to do

  const round = slot.team.currentRound;

  await prisma.$transaction(async (tx) => {
    if (slot.participantId) {
      // Clear the staged order too: a half-submitted order from a player who
      // is no longer at the table would otherwise be counted as theirs.
      await tx.pendingOrder.deleteMany({
        where: { participantId: slot.participantId, round },
      });
    }
    await tx.beerTeamSlot.update({
      where: { id: slotId },
      data: { isRobot: true, participantId: null },
    });
  });

  // Removing the last player the team was waiting on should advance it now,
  // not on the next person's submission.
  await resolveTeamIfReady(slot.teamId);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/**
 * Ends the game now, wherever each team happens to be.
 *
 * Teams are left at the round they reached rather than being fast-forwarded;
 * the report reads ragged series without padding, so a team that got to round
 * 12 is scored on 12 rounds.
 */
export async function endSessionEarly(gameSlug: string, sessionId: string) {
  const { session } = await requireHost(sessionId);
  if (session.status !== "ACTIVE") {
    throw new Error("Only a running game can be ended.");
  }

  await prisma.$transaction([
    // Drop orders staged for the round nobody will now play.
    prisma.pendingOrder.deleteMany({ where: { sessionId } }),
    prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
  ]);

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
    select: { id: true, status: true, totalRounds: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE") throw new Error("This session is not active.");

  const participant = await prisma.gameParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: profile.id } },
    include: { slot: { include: { team: true } } },
  });
  if (!participant) throw new Error("You are not a player in this session.");
  if (!participant.slot) {
    throw new Error("You have not been given a seat in this session.");
  }

  const { slot } = participant;
  const round = slot.team.currentRound;

  // A player sitting on a stale page could otherwise stage an order for a round
  // their chain has already passed, which would linger as an orphan row.
  if (round > session.totalRounds) {
    throw new Error("Your chain has already played all of its rounds.");
  }

  // Clamp rather than reject. siemsene: "If players enter a negative order,
  // the order is replaced with 0." A thrown error in the middle of a timed
  // classroom round is worse than a sane value.
  const raw = Number(formData.get("amount"));
  const amount = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;

  await prisma.pendingOrder.upsert({
    where: { participantId_round: { participantId: participant.id, round } },
    update: { amount },
    create: {
      sessionId,
      teamId: slot.teamId,
      participantId: participant.id,
      round,
      amount,
    },
  });

  await resolveTeamIfReady(slot.teamId);

  revalidatePath(sessionPath(gameSlug, sessionId));
}

/**
 * Advances one team if every human seat on it has an order in for its current
 * round. Teams are independent, so a slow team never stalls the class.
 */
async function resolveTeamIfReady(teamId: string) {
  // Loops rather than resolving once. A team with humans on it can only become
  // ready again when somebody submits, so the loop exits after one pass. But a
  // team the host has handed *entirely* to Beer-GPT has nobody left to trigger
  // its next round, and would otherwise freeze mid-game — so it plays itself
  // out to the end here. Bounded by the round count, never `while (true)`.
  for (let guard = 0; guard <= TOTAL_ROUNDS_MAX + 1; guard++) {
    const team = await prisma.beerTeam.findUnique({
      where: { id: teamId },
      include: {
        slots: true,
        session: { select: { totalRounds: true, status: true } },
      },
    });
    if (!team || team.session.status !== "ACTIVE") return;
    if (team.currentRound > team.session.totalRounds) return; // finished

    const humanSlots = team.slots.filter((s) => !s.isRobot && s.participantId);
    const pending = await prisma.pendingOrder.findMany({
      where: { teamId, round: team.currentRound },
      select: { participantId: true },
    });

    const submitted = new Set(pending.map((p) => p.participantId));
    const everyoneIn = humanSlots.every(
      (s) => s.participantId && submitted.has(s.participantId),
    );
    if (!everyoneIn) return;

    try {
      await resolveAndAdvance(teamId, team.currentRound);
    } catch (err) {
      // Two players submitting the last order at nearly the same instant can
      // both observe a full set and race to resolve. The unique
      // (teamId, role, round) constraint rejects the loser rather than
      // double-writing — and because robot jitter is seeded from
      // (teamId, round, role), the loser computed byte-identical numbers, so
      // discarding its work changes nothing.
      const isDuplicate =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";
      if (!isDuplicate) throw err;
      return; // the winner is advancing this team; leave it to them
    }

    // Humans present means the next round needs their input, so stop here.
    if (humanSlots.length > 0) return;
  }
}

async function resolveAndAdvance(teamId: string, round: number) {
  const team = await prisma.beerTeam.findUniqueOrThrow({
    where: { id: teamId },
    include: {
      slots: true,
      session: { select: { id: true, totalRounds: true, config: true } },
    },
  });

  const [pastRounds, pending] = await Promise.all([
    prisma.gameRoundState.findMany({
      where: { teamId, round: { gte: round - 2, lt: round } },
    }),
    prisma.pendingOrder.findMany({ where: { teamId, round } }),
  ]);

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

  const slotByRole = new Map(team.slots.map((s) => [s.role, s]));
  const roleByParticipantId = new Map(
    team.slots
      .filter((s) => s.participantId)
      .map((s) => [s.participantId!, s.role]),
  );

  const orders: Partial<Record<BeerGameRole, number>> = {};
  for (const order of pending) {
    const role = roleByParticipantId.get(order.participantId);
    if (role) orders[role] = order.amount;
  }

  const robotRoles = new Set(
    team.slots.filter((s) => s.isRobot).map((s) => s.role),
  );

  const config = parseBeerConfig(team.session.config);
  const resolved = resolveRound(round, history, orders, config, robotRoles, team.id);

  const roundCost = ROLE_ORDER.reduce((sum, role) => sum + resolved[role].cost, 0);
  const isFinalRound = round >= team.session.totalRounds;

  await prisma.$transaction(async (tx) => {
    await tx.gameRoundState.createMany({
      data: ROLE_ORDER.map((role) => ({
        sessionId: team.sessionId,
        teamId,
        // Attribute the round to whoever held the seat, so a player who is
        // later swapped for a robot keeps their earlier rounds.
        participantId: slotByRole.get(role)?.participantId ?? null,
        role,
        round,
        ...resolved[role],
      })),
    });

    await tx.pendingOrder.deleteMany({ where: { teamId, round } });

    await tx.beerTeam.update({
      where: { id: teamId },
      data: {
        currentRound: round + 1,
        totalCost: { increment: roundCost },
      },
    });

    // Deliberately not touching GameSession.currentRound here: teams resolve
    // independently, so writing this team's round would make the session
    // counter jump backwards whenever a slower team caught up. The views
    // derive session progress from the teams themselves.

    if (isFinalRound) {
      // The session is done only once every team has played its last round.
      const unfinished = await tx.beerTeam.count({
        where: {
          sessionId: team.sessionId,
          currentRound: { lte: team.session.totalRounds },
        },
      });
      if (unfinished === 0) {
        await tx.gameSession.update({
          where: { id: team.sessionId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
    }
  });
}
