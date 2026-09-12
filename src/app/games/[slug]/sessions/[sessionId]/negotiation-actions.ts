"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import {
  centralizedOptimum,
  clampNote,
  clampPrice,
  clampQuantities,
  coordinationLoss,
  hashSeed,
  roundDeadlineFrom,
  settleDyad,
  type NegotiationConfig,
} from "@/lib/negotiation";
import {
  botProcurement,
  botRetailerResponse,
  botRfq,
  botWholesalerProposal,
  retailerBotProfile,
  wholesalerBotProfile,
} from "@/lib/negotiationBot";
import { addNegotiationParticipant, configFromSession, createDyadsForSession } from "@/lib/negotiationGames";
import { prisma } from "@/lib/prisma";

function sessionPath(gameSlug: string, sessionId: string) {
  return `/games/${gameSlug}/sessions/${sessionId}`;
}

function isP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

// Postgres write-conflict/deadlock under Serializable isolation surfaces
// through Prisma as P2034 ("Transaction failed due to a write conflict or a
// deadlock. Please retry your transaction.").
function isSerializationFailure(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2034";
}

function asNumberArray(value: unknown): number[] | null {
  return Array.isArray(value) ? (value as number[]) : null;
}

function parseQuantities(formData: FormData, config: NegotiationConfig): unknown[] {
  return config.monthlyDemand.map((_, i) => formData.get(`qty-${i}`));
}

type Role = "RETAILER" | "WHOLESALER";

// ---- participant-facing actions ----

export async function joinAsParticipant(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to join.");

  await addNegotiationParticipant(sessionId, profile.id);
  revalidatePath(sessionPath(gameSlug, sessionId));
}

export async function startSession(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Session not found.");

  const canManage = !!profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the instructor can start this session.");
  if (session.status !== "PENDING") throw new Error("This session has already started.");
  if (session.participants.length < 1) {
    throw new Error("Need at least 1 participant before starting.");
  }

  const startedAt = new Date();
  const config = configFromSession(session);

  // One transaction claims the PENDING->ACTIVE transition AND creates the
  // dyads. Previously these were separate statements with a fallible write
  // (an unbounded roundMinutes could throw an Invalid Date into Prisma)
  // sitting between them — a failure there left the session permanently
  // PENDING-with-dyads-already-created, unrecoverable because retrying hit
  // a unique-constraint violation on the dyads that already existed. Now
  // either the whole start happens or none of it does.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.negotiationSession.updateMany({
      where: { id: sessionId, status: "PENDING" }, // atomic claim: only one concurrent caller wins
      data: {
        status: "ACTIVE",
        startedAt,
        roundDeadlineAt: roundDeadlineFrom(startedAt, config),
      },
    });
    if (claimed.count !== 1) throw new Error("This session has already started.");
    await createDyadsForSession(sessionId, tx);
  });

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// The retailer's request for quotation (Fig. 6): monthly quantities, and an
// optional choice to reveal the demand schedule those quantities are based
// on. Both retailer seats in a dyad must have submitted before the session
// as a whole moves from the RFQ stage into round 1 (see tryAdvanceStage).
export async function submitRfq(gameSlug: string, sessionId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, dyads: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE" || session.stage !== "RFQ") {
    throw new Error("This session is not accepting RFQs right now.");
  }

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not part of this session.");
  const dyad = session.dyads.find((d) => d.retailerParticipantId === participant.id);
  if (!dyad) throw new Error("You are not seated as a retailer in this session.");

  const config = configFromSession(session);
  const quantities = clampQuantities(parseQuantities(formData, config), config);
  const demandShared = config.allowDemandSharing && formData.get("shareDemand") !== null;

  const updated = await prisma.negotiationDyad.updateMany({
    where: { id: dyad.id, rfqQuantities: { equals: Prisma.DbNull } },
    data: { rfqQuantities: quantities, demandShared },
  });
  if (updated.count !== 1) throw new Error("Your RFQ was already recorded.");

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// The wholesaler's proposal for the current round: a unit price and a
// monthly delivery schedule, plus an optional note (paper, pp. 8-9, step 3).
export async function submitProposal(gameSlug: string, sessionId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, dyads: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE" || session.stage !== "NEGOTIATION") {
    throw new Error("This session is not in a negotiation round right now.");
  }

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not part of this session.");
  const dyad = session.dyads.find((d) => d.wholesalerParticipantId === participant.id);
  if (!dyad) throw new Error("You are not seated as a wholesaler in this session.");
  if (dyad.status !== "NEGOTIATING") throw new Error("Your negotiation has already ended.");

  const config = configFromSession(session);
  const round = await prisma.negotiationRound.findUnique({
    where: { dyadId_round: { dyadId: dyad.id, round: session.currentRound } },
  });
  if (!round) throw new Error("There is no open round to propose into.");

  const price = clampPrice(formData.get("price"), config);
  const quantities = clampQuantities(parseQuantities(formData, config), config);
  const note = clampNote(formData.get("note"), config);

  const updated = await prisma.negotiationRound.updateMany({
    where: { id: round.id, proposalPrice: null },
    data: {
      proposalPrice: price,
      proposalQuantities: quantities,
      proposalNote: note,
      proposalByBot: false,
      proposedAt: new Date(),
    },
  });
  if (updated.count !== 1) throw new Error("A proposal for this round was already submitted.");

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// The retailer's response: accept, request a revision, or — only on the
// final round — reject outright (paper, p.9, step 5: "the retailer must
// make a final accept/reject decision at the end of the third (last) round").
export async function submitResponse(gameSlug: string, sessionId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, dyads: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE" || session.stage !== "NEGOTIATION") {
    throw new Error("This session is not in a negotiation round right now.");
  }

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not part of this session.");
  const dyad = session.dyads.find((d) => d.retailerParticipantId === participant.id);
  if (!dyad) throw new Error("You are not seated as a retailer in this session.");
  if (dyad.status !== "NEGOTIATING") throw new Error("Your negotiation has already ended.");

  const round = await prisma.negotiationRound.findUnique({
    where: { dyadId_round: { dyadId: dyad.id, round: session.currentRound } },
  });
  if (!round || round.proposalPrice == null) {
    throw new Error("There is no proposal to respond to yet.");
  }

  const config = configFromSession(session);
  const isFinalRound = session.currentRound >= config.totalRounds;
  const requestedKind = String(formData.get("kind") ?? "");
  const kind = requestedKind === "ACCEPT" ? "ACCEPT" : isFinalRound ? "REJECT" : "REVISE";

  const requestedPrice = kind === "REVISE" ? clampPrice(formData.get("requestedPrice"), config) : null;
  const requestedQuantities = kind === "REVISE" ? clampQuantities(parseQuantities(formData, config), config) : null;
  const note = clampNote(formData.get("note"), config);

  const updated = await prisma.negotiationRound.updateMany({
    where: { id: round.id, responseKind: null },
    data: {
      responseKind: kind,
      requestedPrice,
      requestedQuantities: requestedQuantities ?? undefined,
      responseNote: note,
      responseByBot: false,
      respondedAt: new Date(),
    },
  });
  if (updated.count !== 1) throw new Error("You have already responded this round.");

  await applyTerminalResponse(dyad.id, kind, round.proposalPrice, round.proposalQuantities, session.currentRound);
  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// The wholesaler's manufacturer procurement schedule for an agreed contract
// (paper, Fig. 4: "you will decide how much and when to order from your
// manufacturer"). Must at least cover the agreed delivery schedule running
// total month by month — it may consolidate orders, but never fall short.
export async function submitProcurement(gameSlug: string, sessionId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, dyads: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE" || session.stage !== "SETTLEMENT") {
    throw new Error("This session is not in settlement right now.");
  }

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not part of this session.");
  const dyad = session.dyads.find((d) => d.wholesalerParticipantId === participant.id);
  if (!dyad) throw new Error("You are not seated as a wholesaler in this session.");
  if (dyad.status !== "AGREED") throw new Error("There is no agreed contract to procure against.");
  if (dyad.procurementSchedule != null) {
    throw new Error("You already submitted a procurement schedule.");
  }

  const config = configFromSession(session);
  const procurement = clampQuantities(parseQuantities(formData, config), config);
  const agreedQuantities = asNumberArray(dyad.agreedQuantities) ?? [];
  if (!procurementCoversDeliveries(procurement, agreedQuantities)) {
    throw new Error(
      "That schedule doesn't cover what you agreed to deliver — check each month's running total.",
    );
  }

  const updated = await prisma.negotiationDyad.updateMany({
    where: { id: dyad.id, procurementSchedule: { equals: Prisma.DbNull } },
    data: { procurementSchedule: procurement },
  });
  if (updated.count !== 1) throw new Error("You already submitted a procurement schedule.");

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// Either party's last chance to walk away before settlement finalizes —
// even after the wholesaler has submitted a procurement schedule. Flipping
// status to NO_DEAL is enough on its own: settleDyad already treats any
// non-AGREED status as a clean zero-profit disagreement point and ignores
// procurementSchedule entirely once status isn't AGREED, and tryAdvanceStage
// only waits on dyads still filtered as AGREED — a refused dyad just drops
// out of that filter on the next read.
export async function refuseSettlement(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in.");

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true, dyads: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE" || session.stage !== "SETTLEMENT") {
    throw new Error("This session is not in settlement right now.");
  }

  const participant = session.participants.find((p) => p.userId === profile.id);
  if (!participant) throw new Error("You are not part of this session.");
  const dyad = session.dyads.find(
    (d) => d.retailerParticipantId === participant.id || d.wholesalerParticipantId === participant.id,
  );
  if (!dyad) throw new Error("You are not seated in this session.");
  if (dyad.status !== "AGREED") throw new Error("There is no agreed contract to refuse.");

  const updated = await prisma.negotiationDyad.updateMany({
    where: { id: dyad.id, sessionId, status: "AGREED" },
    data: { status: "NO_DEAL" },
  });
  if (updated.count !== 1) throw new Error("That contract can no longer be refused.");

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

function procurementCoversDeliveries(procurement: number[], deliveries: number[]): boolean {
  let procCum = 0;
  let delivCum = 0;
  for (let t = 0; t < deliveries.length; t++) {
    procCum += procurement[t] ?? 0;
    delivCum += deliveries[t] ?? 0;
    if (procCum < delivCum) return false;
  }
  return true;
}

// ---- seat management ----

export async function claimBotSeat(
  gameSlug: string,
  sessionId: string,
  dyadId: string,
  role: Role,
) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to claim a seat.");

  const session = await prisma.negotiationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "ACTIVE") throw new Error("This session isn't active.");

  await addNegotiationParticipant(sessionId, profile.id); // no-op if already enrolled
  const participant = await prisma.negotiationParticipant.findUniqueOrThrow({
    where: { sessionId_userId: { sessionId, userId: profile.id } },
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        // Serializable makes the check-then-claim atomic across BOTH FK
        // columns at once. A plain unique constraint can't express "this
        // participant holds no seat anywhere" — a retailer seat in one dyad
        // and a wholesaler seat in another dyad write two DIFFERENT
        // columns, so neither column's own unique index would catch a
        // participant claiming both.
        const alreadySeated = await tx.negotiationDyad.findFirst({
          where: {
            sessionId,
            OR: [{ retailerParticipantId: participant.id }, { wholesalerParticipantId: participant.id }],
          },
        });
        if (alreadySeated) throw new Error("You already have a seat in this session.");

        const updated =
          role === "RETAILER"
            ? await tx.negotiationDyad.updateMany({
                where: { id: dyadId, sessionId, retailerParticipantId: null },
                data: { retailerParticipantId: participant.id },
              })
            : await tx.negotiationDyad.updateMany({
                where: { id: dyadId, sessionId, wholesalerParticipantId: null },
                data: { wholesalerParticipantId: participant.id },
              });
        if (updated.count !== 1) throw new Error("That seat was just taken by someone else.");
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (isSerializationFailure(err) || isP2002(err)) {
      throw new Error("That seat was just taken — refresh and try again.");
    }
    throw err;
  }

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// Host-only: converts a seat to a bot for the rest of the game — the
// pressure valve for an abandoned seat, so one missing student doesn't
// stall their whole dyad indefinitely. Conceptually mirrors the Beer Game's
// kick-to-robot, independently implemented (that module is CC-BY-SA-4.0).
export async function kickToBot(gameSlug: string, sessionId: string, dyadId: string, role: Role) {
  const profile = await getCurrentProfile();
  const session = await prisma.negotiationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found.");
  const canManage = !!profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the instructor can do this.");

  // Scoped by sessionId (dyadId alone would let a host reach a dyad in a
  // session they don't run), restricted to non-terminal dyad states (never
  // touch a settled dyad's history), and guarded on the seat actually being
  // held right now — the same three properties claimBotSeat already has.
  const updated =
    role === "RETAILER"
      ? await prisma.negotiationDyad.updateMany({
          where: {
            id: dyadId,
            sessionId,
            status: { in: ["AWAITING_RFQ", "NEGOTIATING"] },
            retailerParticipantId: { not: null },
          },
          data: { retailerParticipantId: null },
        })
      : await prisma.negotiationDyad.updateMany({
          where: {
            id: dyadId,
            sessionId,
            status: { in: ["AWAITING_RFQ", "NEGOTIATING"] },
            wholesalerParticipantId: { not: null },
          },
          data: { wholesalerParticipantId: null },
        });
  if (updated.count !== 1) {
    throw new Error(
      "That seat can't be replaced now — it may already be a bot, or the negotiation has moved on. Refresh and try again.",
    );
  }

  await drive(sessionId, {});
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// Host-only escape hatch. Plays the bot policy on behalf of every seat
// currently stalling the game — human or bot — until nothing is left
// outstanding. There is no cron/realtime in this app, so a round whose
// advisory time limit has passed does NOT resolve on its own; this is how
// an instructor actually moves it along.
export async function forceAdvance(gameSlug: string, sessionId: string) {
  const profile = await getCurrentProfile();
  const session = await prisma.negotiationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found.");
  const canManage = !!profile && (profile.id === session.instructorId || profile.role === "ADMIN");
  if (!canManage) throw new Error("Only the instructor can force-resolve.");
  if (session.status !== "ACTIVE") throw new Error("This session isn't active.");

  await drive(sessionId, { forceAll: true });
  revalidatePath(sessionPath(gameSlug, sessionId));
}

// ---- internal: applying a terminal response to the dyad ----

async function applyTerminalResponse(
  dyadId: string,
  kind: "ACCEPT" | "REVISE" | "REJECT",
  proposalPrice: number | null,
  proposalQuantities: unknown,
  round: number,
) {
  if (kind === "ACCEPT") {
    await prisma.negotiationDyad.update({
      where: { id: dyadId },
      data: {
        status: "AGREED",
        agreedPrice: proposalPrice,
        agreedQuantities: proposalQuantities === null ? undefined : (proposalQuantities as object),
        agreedAtRound: round,
      },
    });
  } else if (kind === "REJECT") {
    await prisma.negotiationDyad.update({ where: { id: dyadId }, data: { status: "NO_DEAL" } });
  }
  // REVISE leaves the dyad NEGOTIATING — nothing to persist beyond the round row itself.
}

// ---- internal: bots filling in for whichever seats are pending ----
//
// One call handles at most one step per dyad (a proposal OR a response, not
// both), so an all-bot dyad's exchange plays out one beat per call — the
// same reason drive() below loops rather than calling this once. When
// `forceAll` is set (the host's escape hatch), it plays the SAME policy on
// behalf of a stalled human seat too, not just genuine bot seats.
async function runBotsFor(sessionId: string, opts: { forceAll?: boolean }): Promise<boolean> {
  const session = await prisma.negotiationSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { dyads: true },
  });
  if (session.status !== "ACTIVE") return false;

  const config = configFromSession(session);
  const force = opts.forceAll ?? false;
  let didWork = false;

  if (session.stage === "RFQ") {
    for (const dyad of session.dyads) {
      if (dyad.rfqQuantities != null) continue;
      const isBotSeat = dyad.retailerParticipantId == null;
      if (!isBotSeat && !force) continue;
      const updated = await prisma.negotiationDyad.updateMany({
        where: { id: dyad.id, rfqQuantities: { equals: Prisma.DbNull } },
        data: { rfqQuantities: botRfq(config), demandShared: true },
      });
      if (updated.count === 1) didWork = true;
    }
    return didWork;
  }

  if (session.stage === "NEGOTIATION") {
    const round = session.currentRound;
    const rounds = await prisma.negotiationRound.findMany({ where: { sessionId, round } });
    const roundByDyad = new Map(rounds.map((r) => [r.dyadId, r]));

    for (const dyad of session.dyads) {
      if (dyad.status !== "NEGOTIATING") continue;
      const roundRow = roundByDyad.get(dyad.id);
      if (!roundRow) continue;

      if (roundRow.proposalPrice == null) {
        const isBotSeat = dyad.wholesalerParticipantId == null;
        if (!isBotSeat && !force) continue;
        const profile = wholesalerBotProfile(hashSeed(sessionId, dyad.id, "WHOLESALER"), config);
        const proposal = botWholesalerProposal(round, profile, config);
        const updated = await prisma.negotiationRound.updateMany({
          where: { id: roundRow.id, proposalPrice: null },
          data: {
            proposalPrice: proposal.price,
            proposalQuantities: proposal.quantities,
            proposalByBot: true,
            proposedAt: new Date(),
          },
        });
        if (updated.count === 1) didWork = true;
        // A real exchange has the retailer respond to THIS proposal on a
        // later beat, not the same one — leave the response for the next
        // call, which is exactly what drive()'s loop provides.
        continue;
      }

      if (roundRow.responseKind == null) {
        const isBotSeat = dyad.retailerParticipantId == null;
        if (!isBotSeat && !force) continue;
        const profile = retailerBotProfile(hashSeed(sessionId, dyad.id, "RETAILER"), config);
        const proposal = {
          price: roundRow.proposalPrice,
          quantities: asNumberArray(roundRow.proposalQuantities) ?? [],
        };
        const response = botRetailerResponse(round, proposal, profile, config);
        const updated = await prisma.negotiationRound.updateMany({
          where: { id: roundRow.id, responseKind: null },
          data: {
            responseKind: response.kind,
            requestedPrice: response.requestedPrice,
            requestedQuantities: response.requestedQuantities ?? undefined,
            responseByBot: true,
            respondedAt: new Date(),
          },
        });
        if (updated.count === 1) {
          didWork = true;
          await applyTerminalResponse(dyad.id, response.kind, roundRow.proposalPrice, roundRow.proposalQuantities, round);
        }
      }
    }
    return didWork;
  }

  if (session.stage === "SETTLEMENT") {
    for (const dyad of session.dyads) {
      if (dyad.status !== "AGREED" || dyad.procurementSchedule != null) continue;
      const isBotSeat = dyad.wholesalerParticipantId == null;
      if (!isBotSeat && !force) continue;
      const agreedQuantities = asNumberArray(dyad.agreedQuantities) ?? [];
      const updated = await prisma.negotiationDyad.updateMany({
        where: { id: dyad.id, procurementSchedule: { equals: Prisma.DbNull } },
        data: { procurementSchedule: botProcurement(agreedQuantities, config) },
      });
      if (updated.count === 1) didWork = true;
    }
    return didWork;
  }

  return false;
}

// ---- internal: advancing the session once every dyad has closed out the
// current stage ----
//
// Unlike Fish Banks (where the unit of completion is a per-participant
// submission), the unit of completion here is a DYAD reaching a terminal
// state for the current round — and a round can close for one dyad while
// another dyad is still negotiating. So this checks per-dyad completion,
// not a single flat count. The actual concurrency barrier on each
// transition is the unique constraint on the row the transition creates
// (NegotiationRound's (dyadId, round), or NegotiationOutcome's (dyadId,
// role) at settlement) — a losing concurrent caller's transaction fails
// with P2002 and is treated as a no-op, exactly like Fish Banks's
// resolveAndAdvance.
async function tryAdvanceStage(sessionId: string): Promise<boolean> {
  const session = await prisma.negotiationSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { dyads: true },
  });
  if (session.status !== "ACTIVE") return false;
  const config = configFromSession(session);

  if (session.stage === "RFQ") {
    const allSubmitted = session.dyads.length > 0 && session.dyads.every((d) => d.rfqQuantities != null);
    if (!allSubmitted) return false;

    try {
      await prisma.$transaction([
        prisma.negotiationSession.update({
          where: { id: sessionId },
          data: {
            stage: "NEGOTIATION",
            currentRound: 1,
            roundDeadlineAt: roundDeadlineFrom(new Date(), config),
          },
        }),
        prisma.negotiationDyad.updateMany({ where: { sessionId }, data: { status: "NEGOTIATING" } }),
        prisma.negotiationRound.createMany({
          data: session.dyads.map((d) => ({ sessionId, dyadId: d.id, round: 1 })),
        }),
      ]);
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  if (session.stage === "NEGOTIATION") {
    const round = session.currentRound;
    const rounds = await prisma.negotiationRound.findMany({ where: { sessionId, round } });
    const roundByDyad = new Map(rounds.map((r) => [r.dyadId, r]));

    const stillOpen = session.dyads.some((d) => {
      if (d.status !== "NEGOTIATING") return false;
      const r = roundByDyad.get(d.id);
      return !r || r.responseKind == null;
    });
    if (stillOpen) return false;

    const activeDyads = session.dyads.filter((d) => d.status === "NEGOTIATING");

    if (activeDyads.length === 0) {
      try {
        await prisma.negotiationSession.update({
          where: { id: sessionId },
          data: { stage: "SETTLEMENT", roundDeadlineAt: null },
        });
        return true;
      } catch {
        return false;
      }
    }

    const nextRound = round + 1;
    try {
      await prisma.$transaction([
        prisma.negotiationSession.update({
          where: { id: sessionId },
          data: { currentRound: nextRound, roundDeadlineAt: roundDeadlineFrom(new Date(), config) },
        }),
        prisma.negotiationRound.createMany({
          data: activeDyads.map((d) => ({ sessionId, dyadId: d.id, round: nextRound })),
        }),
      ]);
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  if (session.stage === "SETTLEMENT") {
    const agreedDyads = session.dyads.filter((d) => d.status === "AGREED");
    const allProcured = agreedDyads.every((d) => d.procurementSchedule != null);
    if (!allProcured) return false;

    const central = centralizedOptimum(config);

    const outcomeRows: Prisma.NegotiationOutcomeCreateManyInput[] = [];
    const resultRows: Prisma.NegotiationDyadResultCreateManyInput[] = [];

    for (const dyad of session.dyads) {
      const status = dyad.status === "AGREED" ? "AGREED" : "NO_DEAL";
      const settlement = settleDyad(
        status,
        dyad.agreedPrice,
        asNumberArray(dyad.agreedQuantities),
        asNumberArray(dyad.procurementSchedule),
        config,
      );
      const chainProfit = settlement.retailer.profit + settlement.wholesaler.profit;
      const { loss, efficiency } = coordinationLoss(chainProfit, central.profit);

      if (dyad.retailerParticipantId) {
        outcomeRows.push({
          sessionId,
          dyadId: dyad.id,
          participantId: dyad.retailerParticipantId,
          role: "RETAILER",
          isBot: false,
          dealt: settlement.dealt,
          agreedPrice: dyad.agreedPrice,
          unitsContracted: settlement.retailer.unitsContracted,
          unitsSold: settlement.retailer.unitsSold,
          unmetDemand: settlement.retailer.unmetDemand,
          endingInventory: settlement.retailer.endingInventory,
          revenue: settlement.retailer.revenue,
          goodsCost: settlement.retailer.goodsCost,
          orderingCost: settlement.retailer.orderingCost,
          holdingCost: settlement.retailer.holdingCost,
          salvageRevenue: settlement.retailer.salvageRevenue,
          profit: settlement.retailer.profit,
        });
      }
      if (dyad.wholesalerParticipantId) {
        // Wholesaler-side fields map onto the same generic columns: what it
        // procured/shipped/fell short on, rather than the retailer's
        // contracted/sold/unmet-demand framing.
        outcomeRows.push({
          sessionId,
          dyadId: dyad.id,
          participantId: dyad.wholesalerParticipantId,
          role: "WHOLESALER",
          isBot: false,
          dealt: settlement.dealt,
          agreedPrice: dyad.agreedPrice,
          unitsContracted: settlement.wholesaler.unitsProcured,
          unitsSold: settlement.wholesaler.unitsShipped,
          unmetDemand: settlement.wholesaler.shortfall,
          endingInventory: settlement.wholesaler.endingInventory,
          revenue: settlement.wholesaler.revenue,
          goodsCost: settlement.wholesaler.goodsCost,
          orderingCost: settlement.wholesaler.orderingCost,
          holdingCost: settlement.wholesaler.holdingCost,
          salvageRevenue: settlement.wholesaler.salvageRevenue,
          profit: settlement.wholesaler.profit,
        });
      }

      resultRows.push({
        dyadId: dyad.id,
        dealt: settlement.dealt,
        chainProfit,
        centralizedProfit: central.profit,
        coordinationLoss: loss,
        efficiency,
        deliveryCount: settlement.retailer.deliveryCount,
        procurementCount: settlement.wholesaler.procurementCount,
      });
    }

    try {
      await prisma.$transaction([
        prisma.negotiationSession.update({
          where: { id: sessionId },
          data: { status: "COMPLETED", completedAt: new Date() },
        }),
        prisma.negotiationOutcome.createMany({ data: outcomeRows }),
        prisma.negotiationDyadResult.createMany({ data: resultRows }),
      ]);
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  return false;
}

// The single post-write entry point for every action in this file: fills in
// any bot moves that are due, then checks whether the session can advance,
// repeating until neither makes further progress. Bounded well above what
// any real game (RFQ + up to 10 rounds + settlement, per dyad) could need.
async function drive(sessionId: string, opts: { forceAll?: boolean }) {
  for (let guard = 0; guard < 100; guard++) {
    const didWork = await runBotsFor(sessionId, opts);
    const advancedStage = await tryAdvanceStage(sessionId);
    if (!didWork && !advancedStage) return;
  }
}
