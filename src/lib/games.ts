// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Beer Game enrolment. Late joiners taking over a Beer-GPT seat follows
// siemsene/beergame ("players who join late can still join by replacing robo
// players"). See NOTICE.md for attribution.

import { pickTeamForLateJoin } from "@/lib/beerGameTeams";
import { prisma } from "@/lib/prisma";

/**
 * Enrols a user in a Beer Game session.
 *
 * Shared by the "enter a join code" flow (games/[slug]/actions.ts) and the
 * "Join this session" button on a session page
 * (games/[slug]/sessions/[sessionId]/actions.ts) — both need to actually
 * enroll the user, not just navigate them to the session.
 *
 * Before the host starts, this just adds a name to the roster: there are no
 * roles yet, because the cohort is drawn at start. After the host has started,
 * the user takes over a robot's seat if one is free.
 */
export async function addParticipant(sessionId: string, userId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: { select: { id: true, userId: true } },
      teams: {
        orderBy: { createdAt: "asc" },
        include: { slots: { select: { id: true, role: true, isRobot: true } } },
      },
    },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status === "COMPLETED") {
    throw new Error("This session has already finished.");
  }

  if (session.participants.some((p) => p.userId === userId)) {
    return; // already enrolled, nothing to do
  }

  if (session.status === "PENDING") {
    await prisma.gameParticipant.create({ data: { sessionId, userId } });
    return;
  }

  // ACTIVE: the cohort is already drawn, so the only way in is a robot's seat.
  const target = pickTeamForLateJoin(session.teams);
  if (!target) {
    throw new Error(
      "This session is full — every seat already has a player in it.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const participant = await tx.gameParticipant.create({
      data: { sessionId, userId },
    });

    // Guarded update rather than a blind write: two late joiners can pick the
    // same seat between the read above and this write, and the loser must be
    // told to retry instead of silently displacing the winner.
    const claimed = await tx.beerTeamSlot.updateMany({
      where: { id: target.slotId, isRobot: true, participantId: null },
      data: { isRobot: false, participantId: participant.id },
    });
    if (claimed.count === 0) {
      throw new Error("That seat was just taken — try joining again.");
    }
  });
}
