import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_NEGOTIATION_CONFIG,
  hashSeed,
  shuffleSeeded,
  type NegotiationConfig,
} from "@/lib/negotiation";

// Fictional firm names for the RETAILER seat and the WHOLESALER seat, so a
// dyad's two sides never share a name and the roster reads like a class
// roster of company names rather than "Team 1 / Team 2".
const RETAILER_FIRM_POOL = [
  "Cedar Street Outfitters",
  "Harbor & Vine Retail",
  "Union Square Goods",
  "Maple Row Mercantile",
  "Lakeside General Store",
  "Brightside Retailers",
  "Ferry Landing Supply",
  "Old Mill Trading Co.",
];

const WHOLESALER_FIRM_POOL = [
  "Northgate Supply Co.",
  "Meridian Wholesale",
  "Ironbridge Distribution",
  "Summit Line Traders",
  "Copperfield Wholesale",
  "Anchor Point Supply",
  "Riverside Distributors",
  "Cascade Wholesale Group",
];

function firmName(pool: string[], index: number): string {
  return pool[index % pool.length] ?? `Firm ${index + 1}`;
}

export function configFromSession(session: { config: unknown }): NegotiationConfig {
  return { ...DEFAULT_NEGOTIATION_CONFIG, ...(session.config as Partial<NegotiationConfig> | null) };
}

// Mirrors src/lib/fishBanksGames.ts's addFishBanksParticipant, but with one
// deliberate difference: this accepts an ACTIVE session too, not just
// PENDING. Fish Banks has no reason to admit a late joiner once play starts
// (there's no seat-takeover mechanic); here a late joiner taking over a bot
// seat (see claimBotSeat in the session actions) needs a NegotiationParticipant
// row to exist first, so PENDING-only would make that flow impossible.
export async function addNegotiationParticipant(sessionId: string, userId: string) {
  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Session not found.");
  if (session.status === "COMPLETED") {
    throw new Error("This session has already finished.");
  }
  if (session.participants.some((p) => p.userId === userId)) {
    return; // already enrolled, nothing to do
  }

  await prisma.negotiationParticipant.create({ data: { sessionId, userId } });
}

// Draws fixed retailer/wholesaler dyads for the whole game — "each retailer
// ... negotiates with a single wholesaler" (paper, p.4). An odd participant
// count, or any leftover single seat, is filled with a bot counterpart
// rather than leaving someone without a partner.
//
// Takes the caller's transaction client rather than opening its own: this
// only ever runs as part of starting a session, and the start itself must be
// atomic with the "is this session still PENDING" check (see startSession in
// the session actions file) — nesting a second $transaction inside that
// isn't possible, so the caller's `tx` is threaded straight through.
export async function createDyadsForSession(sessionId: string, tx: Prisma.TransactionClient) {
  const session = await tx.negotiationSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { participants: true },
  });

  const order = shuffleSeeded(session.participants.map((p) => p.id), hashSeed(sessionId));

  const dyads: {
    dyadNumber: number;
    retailerFirmName: string;
    wholesalerFirmName: string;
    retailerParticipantId: string | null;
    wholesalerParticipantId: string | null;
  }[] = [];

  for (let i = 0, dyadNumber = 1; i < order.length; i += 2, dyadNumber++) {
    dyads.push({
      dyadNumber,
      retailerFirmName: firmName(RETAILER_FIRM_POOL, dyadNumber - 1),
      wholesalerFirmName: firmName(WHOLESALER_FIRM_POOL, dyadNumber - 1),
      retailerParticipantId: order[i] ?? null,
      wholesalerParticipantId: order[i + 1] ?? null, // undefined (odd count) becomes a bot seat
    });
  }

  // A single transaction connection processes queries one at a time anyway,
  // so this is a plain sequential loop rather than prisma.$transaction([...])
  // — there's no separate transaction left to open here.
  for (const d of dyads) {
    await tx.negotiationDyad.create({
      data: {
        sessionId,
        dyadNumber: d.dyadNumber,
        retailerFirmName: d.retailerFirmName,
        wholesalerFirmName: d.wholesalerFirmName,
        retailerParticipantId: d.retailerParticipantId,
        wholesalerParticipantId: d.wholesalerParticipantId,
      },
    });
  }

  return dyads.length;
}
