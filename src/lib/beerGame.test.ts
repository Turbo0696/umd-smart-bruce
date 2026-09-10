// SPDX-License-Identifier: CC-BY-SA-4.0
import { describe, expect, it } from "vitest";
import {
  ROLE_ORDER,
  resolveRound,
  robotOrder,
  type BeerGameRole,
  type RoundStateByRole,
} from "@/lib/beerGame";
import {
  DEFAULT_BEER_CONFIG,
  type BeerGameConfig,
} from "@/lib/beerGameConfig";

function config(overrides: Partial<BeerGameConfig> = {}): BeerGameConfig {
  return { ...DEFAULT_BEER_CONFIG, ...overrides };
}

/** Folds a resolved round into the history shape the engine reads back. */
function toHistoryEntry(
  round: number,
  resolved: ReturnType<typeof resolveRound>,
): RoundStateByRole {
  return Object.fromEntries(
    ROLE_ORDER.map((role) => [
      role,
      {
        round,
        inventory: resolved[role].inventory,
        backlog: resolved[role].backlog,
        shipped: resolved[role].shipped,
        outgoingOrder: resolved[role].outgoingOrder,
      },
    ]),
  ) as RoundStateByRole;
}

/** Plays a whole game where every human orders `order` every round. */
function playFlat(
  rounds: number,
  cfg: BeerGameConfig,
  order: number,
): { history: Map<number, RoundStateByRole>; rounds: ReturnType<typeof resolveRound>[] } {
  const history = new Map<number, RoundStateByRole>();
  const out: ReturnType<typeof resolveRound>[] = [];
  const orders = Object.fromEntries(
    ROLE_ORDER.map((r) => [r, order]),
  ) as Record<BeerGameRole, number>;

  for (let round = 1; round <= rounds; round++) {
    const resolved = resolveRound(round, history, orders, cfg);
    history.set(round, toHistoryEntry(round, resolved));
    out.push(resolved);
  }
  return { history, rounds: out };
}

describe("resolveRound — steady state", () => {
  // The strongest available check on the pipeline: if demand is flat at 4, the
  // pipeline is seeded at 4, and every player orders exactly 4, the chain must
  // sit perfectly still. Any error in the two-round shipping delay, the
  // factory's production lag, or the cost formula breaks this immediately.
  const cfg = config({ demandInitial: 4, demandFinal: 4, pipelineSeed: 4, initialInventory: 12 });

  it("holds inventory at the starting level with no backlog for every role", () => {
    const { rounds } = playFlat(12, cfg, 4);

    for (const [index, resolved] of rounds.entries()) {
      for (const role of ROLE_ORDER) {
        expect(resolved[role].inventory, `round ${index + 1} ${role} inventory`).toBe(12);
        expect(resolved[role].backlog, `round ${index + 1} ${role} backlog`).toBe(0);
        expect(resolved[role].shipped, `round ${index + 1} ${role} shipped`).toBe(4);
      }
    }
  });

  it("charges only holding cost: 0.5 x 12 units per role per round", () => {
    const { rounds } = playFlat(12, cfg, 4);
    for (const resolved of rounds) {
      for (const role of ROLE_ORDER) {
        expect(resolved[role].cost).toBe(6);
      }
    }
  });

  it("passes each stage's demand down the chain unchanged", () => {
    const { rounds } = playFlat(6, cfg, 4);
    for (const resolved of rounds) {
      for (const role of ROLE_ORDER) {
        expect(resolved[role].incomingOrder).toBe(4);
      }
    }
  });
});

describe("resolveRound — delays", () => {
  it("seeds the first two rounds' arrivals from the pipeline", () => {
    const cfg = config({ pipelineSeed: 7 });
    const history = new Map<number, RoundStateByRole>();
    for (const round of [1, 2]) {
      const resolved = resolveRound(round, history, {}, cfg);
      for (const role of ROLE_ORDER) {
        expect(resolved[role].incomingShipment).toBe(7);
      }
      history.set(round, toHistoryEntry(round, resolved));
    }
  });

  it("delivers a shipment two rounds after it was sent", () => {
    const cfg = config({ demandInitial: 4, demandFinal: 4 });
    const { history } = playFlat(2, cfg, 4);

    // Round 1 and 2 are pipeline-seeded; round 3 is the first to read history.
    // The retailer's arrivals in round 3 are what the wholesaler shipped in
    // round 1.
    const shippedByWholesalerInRound1 = history.get(1)!.WHOLESALER.shipped;
    const round3 = resolveRound(3, history, {}, cfg);
    expect(round3.RETAILER.incomingShipment).toBe(shippedByWholesalerInRound1);
  });

  it("treats the factory's own order as production finishing two rounds later", () => {
    const cfg = config({ demandInitial: 4, demandFinal: 4 });
    const history = new Map<number, RoundStateByRole>();

    const round1 = resolveRound(1, history, { FACTORY: 19 }, cfg);
    history.set(1, toHistoryEntry(1, round1));
    const round2 = resolveRound(2, history, { FACTORY: 4 }, cfg);
    history.set(2, toHistoryEntry(2, round2));

    // The factory brews rather than orders, so its round-1 request of 19 units
    // arrives as its own round-3 shipment.
    const round3 = resolveRound(3, history, {}, cfg);
    expect(round3.FACTORY.incomingShipment).toBe(19);
  });
});

describe("resolveRound — customer demand", () => {
  it("steps from the initial to the final level on demandStepRound", () => {
    const cfg = config(); // 4 -> 8 at round 5
    const history = new Map<number, RoundStateByRole>();

    expect(resolveRound(4, history, {}, cfg).RETAILER.incomingOrder).toBe(4);
    expect(resolveRound(5, history, {}, cfg).RETAILER.incomingOrder).toBe(8);
  });

  it("builds a backlog when demand steps up and nobody increases orders", () => {
    const cfg = config();
    const history = new Map<number, RoundStateByRole>();
    let lastBacklog = 0;

    for (let round = 1; round <= 12; round++) {
      const resolved = resolveRound(round, history, {
        RETAILER: 4,
        WHOLESALER: 4,
        DISTRIBUTOR: 4,
        FACTORY: 4,
      }, cfg);
      history.set(round, toHistoryEntry(round, resolved));
      lastBacklog = resolved.RETAILER.backlog;
    }

    // Demand doubled at round 5 while replenishment stayed at 4 a round, so the
    // retailer must be short by the end.
    expect(lastBacklog).toBeGreaterThan(0);
  });
});

describe("resolveRound — extra order delay", () => {
  it("off: upstream sees the order placed this round", () => {
    const cfg = config({ extraOrderDelay: false });
    const resolved = resolveRound(1, new Map(), { RETAILER: 7 }, cfg);
    expect(resolved.WHOLESALER.incomingOrder).toBe(7);
  });

  it("on: upstream sees last round's order instead", () => {
    const cfg = config({ extraOrderDelay: true });
    const history = new Map<number, RoundStateByRole>();

    const round1 = resolveRound(1, history, { RETAILER: 11 }, cfg);
    history.set(1, toHistoryEntry(1, round1));

    const round2 = resolveRound(2, history, { RETAILER: 3 }, cfg);
    // 11 was placed in round 1, so it is what the wholesaler must satisfy in
    // round 2 — not the 3 just submitted.
    expect(round2.WHOLESALER.incomingOrder).toBe(11);
  });

  it("on: falls back to the pipeline seed in round 1, which has no prior round", () => {
    const cfg = config({ extraOrderDelay: true, pipelineSeed: 4 });
    const resolved = resolveRound(1, new Map(), { RETAILER: 25 }, cfg);
    expect(resolved.WHOLESALER.incomingOrder).toBe(4);
  });

  it("never delays the retailer, whose demand is exogenous", () => {
    const delayed = resolveRound(5, new Map(), {}, config({ extraOrderDelay: true }));
    const prompt = resolveRound(5, new Map(), {}, config({ extraOrderDelay: false }));
    expect(delayed.RETAILER.incomingOrder).toBe(8);
    expect(prompt.RETAILER.incomingOrder).toBe(8);
  });
});

describe("order sanitising", () => {
  it("clamps a negative human order to zero rather than rejecting it", () => {
    const resolved = resolveRound(1, new Map(), { RETAILER: -12 }, config());
    expect(resolved.RETAILER.outgoingOrder).toBe(0);
  });

  it("rounds a fractional order to a whole number of units", () => {
    const resolved = resolveRound(1, new Map(), { RETAILER: 6.7 }, config());
    expect(resolved.RETAILER.outgoingOrder).toBe(7);
  });

  it("falls back to passing demand through when a human submitted nothing", () => {
    // Not a robot — just no staged order, which the engine treats as a
    // pass-through rather than a zero that would starve the chain.
    const resolved = resolveRound(1, new Map(), {}, config());
    expect(resolved.RETAILER.outgoingOrder).toBe(4);
  });
});

describe("Beer-GPT robots", () => {
  it("is deterministic for a given team, round and role", () => {
    const first = robotOrder(8, "team-a:3:FACTORY");
    const second = robotOrder(8, "team-a:3:FACTORY");
    expect(first).toBe(second);
  });

  it("orders within one unit of the demand it saw", () => {
    for (let round = 1; round <= 200; round++) {
      const order = robotOrder(8, `team:${round}:RETAILER`);
      expect(order).toBeGreaterThanOrEqual(7);
      expect(order).toBeLessThanOrEqual(9);
    }
  });

  it("never returns a negative order even at zero demand", () => {
    for (let round = 1; round <= 200; round++) {
      expect(robotOrder(0, `team:${round}:FACTORY`)).toBeGreaterThanOrEqual(0);
    }
  });

  it("actually varies — a constant bot would flatten the bullwhip", () => {
    const seen = new Set<number>();
    for (let round = 1; round <= 200; round++) {
      seen.add(robotOrder(8, `team:${round}:WHOLESALER`));
    }
    // The property that matters is "not constant". Asserting >= 2 rather than
    // exactly 3 keeps this from being a flaky check on the PRNG's distribution
    // while still failing loudly if the jitter is ever lost.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("resolves a robot role without a submitted order", () => {
    const resolved = resolveRound(
      1,
      new Map(),
      {},
      config(),
      new Set<BeerGameRole>(["FACTORY"]),
      "team-x",
    );
    expect(resolved.FACTORY.wasRobot).toBe(true);
    expect(resolved.RETAILER.wasRobot).toBe(false);
    expect(resolved.FACTORY.outgoingOrder).toBeGreaterThanOrEqual(0);
  });

  it("gives two racing resolvers of the same round identical robot orders", () => {
    // resolveAndAdvance swallows the duplicate-key error when two players race
    // to resolve; that is only safe because the discarded result is identical.
    const args = [
      2,
      new Map<number, RoundStateByRole>(),
      {},
      config(),
      new Set<BeerGameRole>(["WHOLESALER", "FACTORY"]),
      "team-race",
    ] as const;
    const a = resolveRound(...args);
    const b = resolveRound(...args);
    expect(a).toEqual(b);
  });
});
