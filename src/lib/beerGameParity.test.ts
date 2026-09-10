// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Parity against upstream. The fixture in __fixtures__/ was produced by running
// siemsene/beergame's own src/logic/gameEngine.ts (simulateWeek) over a fixed
// 40-round order sequence, so this asserts Bruce's engine reproduces upstream's
// numbers rather than merely being self-consistent. See NOTICE.md.
//
// The fixture uses a CONSTANT customer demand on purpose: upstream's
// simulateWeek indexes config.customerDemand[week] with a 1-based week and so
// reads one element past the intended position. With every element equal, that
// bug is unobservable, and the comparison isolates the pipeline mechanics —
// shipping and production delays, backlog carry-over, and the cost formula —
// which is what we actually want pinned. Bruce's demand step is covered
// separately in beerGameConfig.test.ts and beerGame.test.ts.

import { describe, expect, it } from "vitest";
import goldenJson from "@/lib/__fixtures__/siemsene-engine-golden.json";
import {
  ROLE_ORDER,
  resolveRound,
  type BeerGameRole,
  type RoundStateByRole,
} from "@/lib/beerGame";
import { DEFAULT_BEER_CONFIG, type BeerGameConfig } from "@/lib/beerGameConfig";

type GoldenStage = {
  incomingOrder: number;
  shipped: number;
  inventory: number;
  backlog: number;
  cost: number;
};

type Golden = {
  config: {
    holdingCost: number;
    backorderCost: number;
    initialInventory: number;
    pipelineSeed: number;
    constantDemand: number;
    rounds: number;
  };
  orders: Record<BeerGameRole, number>[];
  rounds: ({ round: number } & Record<BeerGameRole, GoldenStage>)[];
};

const golden = goldenJson as unknown as Golden;

describe("engine parity with siemsene/beergame", () => {
  const config: BeerGameConfig = {
    ...DEFAULT_BEER_CONFIG,
    holdingCost: golden.config.holdingCost,
    backorderCost: golden.config.backorderCost,
    initialInventory: golden.config.initialInventory,
    pipelineSeed: golden.config.pipelineSeed,
    // Flat demand: initial === final makes the step round irrelevant.
    demandInitial: golden.config.constantDemand,
    demandFinal: golden.config.constantDemand,
    demandStepRound: 1,
    extraOrderDelay: false,
    showUpstreamBacklog: false,
  };

  // Replay the whole game once, then assert per round/role below.
  const history = new Map<number, RoundStateByRole>();
  const actual = golden.rounds.map((_, index) => {
    const round = index + 1;
    const resolved = resolveRound(
      round,
      history,
      golden.orders[index],
      config,
      new Set<BeerGameRole>(), // no robots: every order is supplied
      "parity",
    );
    history.set(
      round,
      Object.fromEntries(
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
      ) as RoundStateByRole,
    );
    return resolved;
  });

  it("has a fixture covering the full game", () => {
    expect(golden.rounds).toHaveLength(golden.config.rounds);
    expect(golden.orders).toHaveLength(golden.config.rounds);
  });

  it.each(ROLE_ORDER)("matches upstream for every round: %s", (role) => {
    for (const [index, expected] of golden.rounds.entries()) {
      const round = index + 1;
      const got = actual[index][role];
      const want = expected[role];

      expect(got.incomingOrder, `round ${round} ${role} incomingOrder`).toBe(
        want.incomingOrder,
      );
      expect(got.shipped, `round ${round} ${role} shipped`).toBe(want.shipped);
      expect(got.inventory, `round ${round} ${role} inventory`).toBe(
        want.inventory,
      );
      expect(got.backlog, `round ${round} ${role} backlog`).toBe(want.backlog);
      expect(got.cost, `round ${round} ${role} cost`).toBeCloseTo(want.cost, 10);
    }
  });

  it("exercises backlog, not just the steady state", () => {
    // Guards the fixture itself: a sequence that never went short would make
    // the comparison above much weaker than it looks.
    const sawBacklog = golden.rounds.some((r) =>
      ROLE_ORDER.some((role) => r[role].backlog > 0),
    );
    expect(sawBacklog).toBe(true);
  });

  it("accumulates the same total supply-chain cost as upstream", () => {
    const expectedTotal = golden.rounds.reduce(
      (sum, r) => sum + ROLE_ORDER.reduce((s, role) => s + r[role].cost, 0),
      0,
    );
    const actualTotal = actual.reduce(
      (sum, r) => sum + ROLE_ORDER.reduce((s, role) => s + r[role].cost, 0),
      0,
    );
    expect(actualTotal).toBeCloseTo(expectedTotal, 8);
  });
});
