// SPDX-License-Identifier: CC-BY-SA-4.0
import { describe, expect, it } from "vitest";
import type { BeerGameRole } from "@/lib/beerGame";
import {
  buildLeaderboardRows,
  buildStdDevRows,
  buildTeamAnalytics,
  computeBullwhip,
  formatBullwhip,
  populationVariance,
  standardDeviation,
  type AnalyticsRoundRow,
  type TeamAnalytics,
} from "@/lib/beerGameAnalytics";

function orders(partial: Partial<Record<BeerGameRole, number[]>>): Record<BeerGameRole, number[]> {
  return {
    RETAILER: partial.RETAILER ?? [],
    WHOLESALER: partial.WHOLESALER ?? [],
    DISTRIBUTOR: partial.DISTRIBUTOR ?? [],
    FACTORY: partial.FACTORY ?? [],
  };
}

function team(overrides: Partial<TeamAnalytics> = {}): TeamAnalytics {
  return {
    id: "t1",
    name: "Malt Mallards",
    totalCost: 100,
    roundsCompleted: 4,
    robotCount: 0,
    ordersByRole: orders({}),
    ...overrides,
  };
}

describe("variance", () => {
  // Textbook series with mean 5. Population variance is 32/8 = 4; the sample
  // variance would be 32/7 ~= 4.571, so this pins which one we use — it has to
  // match siemsene's for bullwhip figures to be comparable.
  const series = [2, 4, 4, 4, 5, 5, 7, 9];

  it("divides by n, not n-1", () => {
    expect(populationVariance(series)).toBe(4);
    expect(populationVariance(series)).not.toBeCloseTo(32 / 7, 5);
  });

  it("takes the square root for standard deviation", () => {
    expect(standardDeviation(series)).toBe(2);
  });

  it("is zero for a constant series", () => {
    expect(populationVariance([6, 6, 6, 6])).toBe(0);
  });

  it("is zero for an empty series rather than NaN", () => {
    expect(populationVariance([])).toBe(0);
    expect(standardDeviation([])).toBe(0);
  });
});

describe("computeBullwhip", () => {
  it("is the ratio of factory to retailer order variance", () => {
    // retailer [4,4,8,8]: mean 6, variance 16/4 = 4
    // factory  [0,4,8,12]: mean 6, variance 80/4 = 20
    const value = computeBullwhip(
      orders({ RETAILER: [4, 4, 8, 8], FACTORY: [0, 4, 8, 12] }),
    );
    expect(value).toBe(5);
  });

  it("is 1 when the factory mirrors the retailer exactly", () => {
    expect(
      computeBullwhip(orders({ RETAILER: [2, 6, 10], FACTORY: [2, 6, 10] })),
    ).toBe(1);
  });

  it("returns null instead of dividing by zero on a flat retailer", () => {
    expect(
      computeBullwhip(orders({ RETAILER: [4, 4, 4], FACTORY: [1, 9, 20] })),
    ).toBeNull();
  });

  it("formats null as N/A and numbers to two decimals", () => {
    expect(formatBullwhip(null)).toBe("N/A");
    expect(formatBullwhip(5)).toBe("5.00");
    expect(formatBullwhip(1.239)).toBe("1.24");
  });
});

describe("buildTeamAnalytics", () => {
  const rows: AnalyticsRoundRow[] = [
    // Deliberately out of order, as a database may return them.
    { role: "RETAILER", round: 2, outgoingOrder: 6, cost: 3 },
    { role: "RETAILER", round: 1, outgoingOrder: 4, cost: 6 },
    { role: "FACTORY", round: 1, outgoingOrder: 9, cost: 6 },
    { role: "FACTORY", round: 2, outgoingOrder: 2, cost: 1 },
  ];

  it("orders each role's series by round", () => {
    const analytics = buildTeamAnalytics({ id: "t1", name: "A", totalCost: 16 }, rows, 1);
    expect(analytics.ordersByRole.RETAILER).toEqual([4, 6]);
    expect(analytics.ordersByRole.FACTORY).toEqual([9, 2]);
  });

  it("reports rounds completed as the longest role series", () => {
    const analytics = buildTeamAnalytics({ id: "t1", name: "A", totalCost: 16 }, rows, 0);
    expect(analytics.roundsCompleted).toBe(2);
  });

  it("leaves roles with no rows as empty series, not padded zeroes", () => {
    // A session ended early must not have phantom zeroes diluting its variance.
    const analytics = buildTeamAnalytics({ id: "t1", name: "A", totalCost: 0 }, rows, 0);
    expect(analytics.ordersByRole.WHOLESALER).toEqual([]);
  });

  it("carries the robot count through", () => {
    const analytics = buildTeamAnalytics({ id: "t1", name: "A", totalCost: 0 }, rows, 3);
    expect(analytics.robotCount).toBe(3);
  });

  it("coerces a non-finite order to zero", () => {
    const analytics = buildTeamAnalytics({ id: "t1", name: "A", totalCost: 0 }, [
      { role: "RETAILER", round: 1, outgoingOrder: Number.NaN, cost: 0 },
    ], 0);
    expect(analytics.ordersByRole.RETAILER).toEqual([0]);
  });
});

describe("buildLeaderboardRows", () => {
  it("ranks the cheapest chain first", () => {
    const rows = buildLeaderboardRows([
      team({ id: "b", name: "Bravo", totalCost: 250 }),
      team({ id: "a", name: "Alpha", totalCost: 100 }),
      team({ id: "c", name: "Charlie", totalCost: 175 }),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "c", "b"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks cost ties on name so the order is stable across page loads", () => {
    const rows = buildLeaderboardRows([
      team({ id: "z", name: "Zulu", totalCost: 100 }),
      team({ id: "m", name: "Mike", totalCost: 100 }),
    ]);
    expect(rows.map((r) => r.teamName)).toEqual(["Mike", "Zulu"]);
  });

  it("includes the bullwhip ratio per team", () => {
    const rows = buildLeaderboardRows([
      team({ ordersByRole: orders({ RETAILER: [4, 4, 8, 8], FACTORY: [0, 4, 8, 12] }) }),
    ]);
    expect(rows[0].bullwhip).toBe(5);
  });

  it("returns an empty list for a session with no teams", () => {
    expect(buildLeaderboardRows([])).toEqual([]);
  });
});

describe("buildStdDevRows", () => {
  it("reports per-role dispersion of orders", () => {
    const rows = buildStdDevRows([
      team({ ordersByRole: orders({ RETAILER: [2, 4, 4, 4, 5, 5, 7, 9] }) }),
    ]);
    expect(rows[0].byRole.RETAILER).toBe(2);
    expect(rows[0].byRole.FACTORY).toBe(0);
  });

  it("uses the same ordering as the leaderboard", () => {
    const input = [
      team({ id: "b", name: "Bravo", totalCost: 250 }),
      team({ id: "a", name: "Alpha", totalCost: 100 }),
    ];
    expect(buildStdDevRows(input).map((r) => r.teamId)).toEqual(
      buildLeaderboardRows(input).map((r) => r.teamId),
    );
  });
});
