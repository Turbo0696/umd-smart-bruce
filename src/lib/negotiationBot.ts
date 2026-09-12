// A scripted, deterministic negotiation counterparty — fills an unfilled or
// abandoned seat so a session never stalls on a missing player, following
// the Beer Game's robot-seat precedent conceptually (any number of
// bot-filled seats, a late joiner can take one over) without importing
// anything from it (that module is CC-BY-SA-4.0; this one is independent).
//
// The protocol only ever asks the WHOLESALER to propose and the RETAILER to
// respond (the paper never has the retailer make an unprompted offer after
// its initial RFQ, pp. 8-9), so that's the only shape a bot needs to fill:
// `botWholesalerProposal` and `botRetailerResponse`, plus an RFQ for a bot
// retailer and a settlement-time procurement submission for a bot
// wholesaler. Nothing here uses randomness at decision time — the seed only
// determines the bot's fixed "personality" for the life of the dyad, so a
// fixed pairing shows a stable counterparty across rounds (the whole point
// of fixed dyads is that reputation and retaliation effects can show up).

import {
  clampPrice,
  clampQuantities,
  clamp,
  groupedSchedule,
  horizonLength,
  lotForLotSchedule,
  mulberry32,
  optimalProcurement,
  retailerSettlement,
  type NegotiationConfig,
} from "@/lib/negotiation";

export type WholesalerBotProfile = {
  anchor: number; // opening price, round 1
  reservation: number; // the price it concedes to by the final round
};

export type RetailerBotProfile = {
  reservation: number; // used only to shape the counter-offer it asks for
};

// Wholesaler's margin fraction of (retailPrice - manufacturerCost) at its
// opening anchor and at its final-round floor. Retailer's counter-ask sits
// well above the wholesaler's floor, so the two ranges never overlap —
// guaranteeing every bot-vs-bot dyad reaches an agreement, never a stall.
const WHOLESALER_ANCHOR_FRACTION: [number, number] = [0.85, 0.95];
const WHOLESALER_RESERVATION_FRACTION: [number, number] = [0.1, 0.25];
const RETAILER_RESERVATION_FRACTION: [number, number] = [0.55, 0.75];

function fractionInRange(seed: number, range: [number, number]): number {
  const rand = mulberry32(seed);
  const [lo, hi] = range;
  return lo + rand() * (hi - lo);
}

export function wholesalerBotProfile(seed: number, config: NegotiationConfig): WholesalerBotProfile {
  const span = config.retailPrice - config.manufacturerCost;
  const anchor = config.manufacturerCost + fractionInRange(seed, WHOLESALER_ANCHOR_FRACTION) * span;
  const reservation = config.manufacturerCost + fractionInRange(seed ^ 0x9e3779b9, WHOLESALER_RESERVATION_FRACTION) * span;
  return { anchor, reservation };
}

export function retailerBotProfile(seed: number, config: NegotiationConfig): RetailerBotProfile {
  const span = config.retailPrice - config.manufacturerCost;
  const reservation = config.manufacturerCost + fractionInRange(seed, RETAILER_RESERVATION_FRACTION) * span;
  return { reservation };
}

// A bot retailer's RFQ: lot-for-lot, matching the paper's own account of what
// minimizes the retailer's costs (p.7) — "the retailer... will want to
// follow a lot-for-lot replenishment policy and make four orders to minimize
// its total inventory costs."
export function botRfq(config: NegotiationConfig): number[] {
  return lotForLotSchedule(config);
}

export type BotProposal = { price: number; quantities: number[] };

// Concedes linearly, in both price and delivery consolidation, from the
// wholesaler's opening anchor toward its reservation as rounds progress —
// `groupedSchedule` sweeps from fully consolidated (round 1) toward
// lot-for-lot (the final round), so by the deadline it is offering close to
// what the retailer actually wants on both axes.
export function botWholesalerProposal(
  round: number,
  profile: WholesalerBotProfile,
  config: NegotiationConfig,
): BotProposal {
  const n = horizonLength(config);
  const totalRounds = config.totalRounds;
  const frac = totalRounds <= 1 ? 1 : clamp((round - 1) / (totalRounds - 1), 0, 1);
  const rawPrice = profile.anchor + (profile.reservation - profile.anchor) * frac;
  const groups = 1 + frac * (n - 1);
  const quantities = groupedSchedule(config, Math.round(groups));
  return {
    price: clampPrice(rawPrice, config),
    quantities: clampQuantities(quantities, config),
  };
}

export type BotResponse = {
  kind: "ACCEPT" | "REVISE" | "REJECT";
  requestedPrice: number | null;
  requestedQuantities: number[] | null;
};

// Rational-agent accept rule: accept anything that yields non-negative
// profit (the same payoff a no-deal outcome gives), so the bot never
// irrationally rejects a workable contract and never accepts a losing one.
// The `reservation` in the profile shapes only what it asks for on a
// REVISE, not the accept decision itself.
export function botRetailerResponse(
  round: number,
  proposal: BotProposal,
  profile: RetailerBotProfile,
  config: NegotiationConfig,
): BotResponse {
  const settlement = retailerSettlement(proposal.price, proposal.quantities, config);
  const isFinalRound = round >= config.totalRounds;

  if (settlement.profit >= 0) {
    return { kind: "ACCEPT", requestedPrice: null, requestedQuantities: null };
  }
  if (isFinalRound) {
    return { kind: "REJECT", requestedPrice: null, requestedQuantities: null };
  }
  return {
    kind: "REVISE",
    requestedPrice: clampPrice(profile.reservation, config),
    requestedQuantities: lotForLotSchedule(config),
  };
}

// At settlement, a bot wholesaler always submits the cost-minimizing
// procurement schedule for the contract it agreed to — the same schedule
// `optimalProcurement` computes and shows on the instructor panel for a
// human wholesaler to compare against.
export function botProcurement(agreedQuantities: number[], config: NegotiationConfig): number[] {
  return optimalProcurement(agreedQuantities, config).schedule;
}
