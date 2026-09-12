import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEGOTIATION_CONFIG,
  consolidatedSchedule,
  lotForLotSchedule,
  optimalProcurement,
  retailerSettlement,
  type NegotiationConfig,
} from "./negotiation";
import {
  botProcurement,
  botRetailerResponse,
  botRfq,
  botWholesalerProposal,
  retailerBotProfile,
  wholesalerBotProfile,
} from "./negotiationBot";

function config(overrides: Partial<NegotiationConfig> = {}): NegotiationConfig {
  return { ...DEFAULT_NEGOTIATION_CONFIG, ...overrides };
}

// Runs a full bot-vs-bot dyad and returns how it ended. Mirrors exactly what
// negotiation-actions.ts's runBotsFor / tryAdvanceStage will do server-side.
function playBotDyad(cfg: NegotiationConfig, wholesalerSeed: number, retailerSeed: number) {
  const wProfile = wholesalerBotProfile(wholesalerSeed, cfg);
  const rProfile = retailerBotProfile(retailerSeed, cfg);
  for (let round = 1; round <= cfg.totalRounds; round++) {
    const proposal = botWholesalerProposal(round, wProfile, cfg);
    const response = botRetailerResponse(round, proposal, rProfile, cfg);
    if (response.kind === "ACCEPT") {
      return { status: "AGREED" as const, round, proposal };
    }
    if (response.kind === "REJECT") {
      return { status: "NO_DEAL" as const, round, proposal };
    }
    // REVISE — the wholesaler bot doesn't react to the counter (it's purely
    // round-indexed), so simply continue to the next round.
  }
  // Should be unreachable: the final round only allows ACCEPT or REJECT.
  return { status: "NO_DEAL" as const, round: cfg.totalRounds, proposal: null };
}

describe("wholesalerBotProfile / retailerBotProfile", () => {
  it("is deterministic for a fixed seed and differs across seeds", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    expect(wholesalerBotProfile(7, cfg)).toEqual(wholesalerBotProfile(7, cfg));
    expect(wholesalerBotProfile(7, cfg)).not.toEqual(wholesalerBotProfile(8, cfg));
    expect(retailerBotProfile(7, cfg)).toEqual(retailerBotProfile(7, cfg));
    expect(retailerBotProfile(7, cfg)).not.toEqual(retailerBotProfile(8, cfg));
  });

  it("keeps the wholesaler's reservation strictly below the retailer's, for every seed — the property that guarantees agreement", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    for (let seed = 0; seed < 200; seed++) {
      const w = wholesalerBotProfile(seed, cfg);
      const r = retailerBotProfile(seed + 100000, cfg);
      expect(w.reservation).toBeLessThan(r.reservation);
    }
  });

  it("never proposes below the manufacturer's own cost", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    for (let seed = 0; seed < 200; seed++) {
      const w = wholesalerBotProfile(seed, cfg);
      expect(w.reservation).toBeGreaterThan(cfg.manufacturerCost);
      expect(w.anchor).toBeGreaterThan(w.reservation);
    }
  });
});

describe("botRfq", () => {
  it("submits lot-for-lot, matching the paper's account of the retailer's actual cost-minimizing preference (p.7)", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    expect(botRfq(cfg)).toEqual(lotForLotSchedule(cfg));
    expect(botRfq(cfg)).toEqual(cfg.monthlyDemand);
  });
});

describe("botWholesalerProposal — the concession ladder", () => {
  const cfg = DEFAULT_NEGOTIATION_CONFIG;
  const profile = wholesalerBotProfile(7, cfg);

  it("opens at its anchor with a fully consolidated schedule", () => {
    const proposal = botWholesalerProposal(1, profile, cfg);
    expect(proposal.price).toBeCloseTo(profile.anchor, 1);
    expect(proposal.quantities).toEqual(consolidatedSchedule(cfg));
  });

  it("concedes to its reservation with a lot-for-lot schedule by the final round", () => {
    const proposal = botWholesalerProposal(cfg.totalRounds, profile, cfg);
    expect(proposal.price).toBeCloseTo(profile.reservation, 1);
    expect(proposal.quantities).toEqual(lotForLotSchedule(cfg));
  });

  it("concedes monotonically — price never goes back up round over round", () => {
    const prices = Array.from({ length: cfg.totalRounds }, (_, i) => botWholesalerProposal(i + 1, profile, cfg).price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it("degenerates cleanly to a single, final-terms round when totalRounds is 1", () => {
    const oneRound = config({ totalRounds: 1 });
    const proposal = botWholesalerProposal(1, profile, oneRound);
    expect(Number.isFinite(proposal.price)).toBe(true);
    expect(proposal.quantities).toEqual(lotForLotSchedule(oneRound));
  });
});

describe("botRetailerResponse — rational-agent accept rule", () => {
  const cfg = DEFAULT_NEGOTIATION_CONFIG;
  const profile = retailerBotProfile(7, cfg);

  it("accepts a proposal with non-negative profit, at any round", () => {
    const goodProposal = { price: cfg.manufacturerCost, quantities: lotForLotSchedule(cfg) };
    const response = botRetailerResponse(1, goodProposal, profile, cfg);
    expect(response.kind).toBe("ACCEPT");
  });

  it("revises — never rejects — a losing proposal before the final round", () => {
    const badProposal = { price: cfg.retailPrice, quantities: consolidatedSchedule(cfg) };
    expect(retailerSettlement(badProposal.price, badProposal.quantities, cfg).profit).toBeLessThan(0);
    const response = botRetailerResponse(1, badProposal, profile, cfg);
    expect(response.kind).toBe("REVISE");
    expect(response.requestedQuantities).toEqual(lotForLotSchedule(cfg));
    expect(response.requestedPrice).toBeCloseTo(profile.reservation, 1);
  });

  it("rejects — never revises — that same losing proposal on the final round", () => {
    const badProposal = { price: cfg.retailPrice, quantities: consolidatedSchedule(cfg) };
    const response = botRetailerResponse(cfg.totalRounds, badProposal, profile, cfg);
    expect(response.kind).toBe("REJECT");
  });

  it("never irrationally walks away from a workable deal, even right at the deadline", () => {
    const okProposal = { price: cfg.manufacturerCost + 5, quantities: lotForLotSchedule(cfg) };
    const response = botRetailerResponse(cfg.totalRounds, okProposal, profile, cfg);
    expect(response.kind).toBe("ACCEPT");
  });
});

describe("bot-vs-bot dyads", () => {
  it("always reach AGREED within totalRounds, across many seed pairings", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    for (let seed = 0; seed < 200; seed++) {
      const outcome = playBotDyad(cfg, seed, seed + 555);
      expect(outcome.status).toBe("AGREED");
      expect(outcome.round).toBeLessThanOrEqual(cfg.totalRounds);
    }
  });

  it("still reaches AGREED with only a single round to negotiate in", () => {
    const cfg = config({ totalRounds: 1 });
    for (let seed = 0; seed < 50; seed++) {
      expect(playBotDyad(cfg, seed, seed + 555).status).toBe("AGREED");
    }
  });
});

describe("botProcurement", () => {
  it("submits exactly the cost-minimizing schedule for the agreed contract", () => {
    const cfg = DEFAULT_NEGOTIATION_CONFIG;
    const agreed = lotForLotSchedule(cfg);
    expect(botProcurement(agreed, cfg)).toEqual(optimalProcurement(agreed, cfg).schedule);
  });
});
