// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Endgame analytics: cross-team leaderboard, bullwhip ratio, per-role order
// dispersion. Ported from siemsene/beergame's src/logic/endgameAnalytics.ts,
// retyped to read resolved GameRoundState rows rather than an in-memory
// TeamState. See NOTICE.md for attribution.
//
// Deliberately free of Prisma imports so the maths is unit-testable without a
// database; `buildTeamAnalytics` is the one seam that maps DB rows in.

import { ROLE_ORDER, type BeerGameRole } from "@/lib/beerGame";

/** Just the fields of GameRoundState the report needs. */
export type AnalyticsRoundRow = {
  role: BeerGameRole;
  round: number;
  outgoingOrder: number;
  cost: number;
};

export type TeamAnalytics = {
  id: string;
  name: string;
  totalCost: number;
  roundsCompleted: number;
  robotCount: number;
  ordersByRole: Record<BeerGameRole, number[]>;
};

export type LeaderboardRow = {
  rank: number;
  teamId: string;
  teamName: string;
  totalCost: number;
  roundsCompleted: number;
  robotCount: number;
  bullwhip: number | null;
};

export type StdDevRow = {
  teamId: string;
  teamName: string;
  byRole: Record<BeerGameRole, number>;
};

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyOrdersByRole(): Record<BeerGameRole, number[]> {
  return {
    RETAILER: [],
    WHOLESALER: [],
    DISTRIBUTOR: [],
    FACTORY: [],
  };
}

/**
 * Population (not sample) variance — the series is the complete record of the
 * game, not a sample drawn from it, so dividing by n is the right call. Keeping
 * this identical to siemsene's is also what makes bullwhip figures comparable
 * between the two implementations.
 */
export function populationVariance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(populationVariance(values));
}

/**
 * The bullwhip ratio: how much more the factory's orders swing than the
 * retailer's. Above 1 means demand distortion amplified up the chain, which is
 * the whole point of the exercise.
 *
 * Returns null when the retailer never varied its order — the ratio would be a
 * division by zero, and "undefined" is more honest than Infinity. Shown as
 * "N/A" in the report.
 */
export function computeBullwhip(
  ordersByRole: Record<BeerGameRole, readonly number[]>,
): number | null {
  const retailerVariance = populationVariance(ordersByRole.RETAILER);
  if (retailerVariance === 0) return null;
  return populationVariance(ordersByRole.FACTORY) / retailerVariance;
}

/**
 * Maps one team's resolved rows into the analytics shape. Orders are ordered by
 * round, and a team that ended early (host pressed End game now) simply has a
 * shorter series — no padding, so variance isn't diluted by phantom zeroes.
 */
export function buildTeamAnalytics(
  team: { id: string; name: string; totalCost: number },
  rows: readonly AnalyticsRoundRow[],
  robotCount: number,
): TeamAnalytics {
  const ordersByRole = emptyOrdersByRole();
  const byRoleRounds = new Map<BeerGameRole, { round: number; order: number }[]>();

  for (const role of ROLE_ORDER) byRoleRounds.set(role, []);
  for (const row of rows) {
    byRoleRounds.get(row.role)?.push({
      round: row.round,
      order: Math.max(0, toFiniteNumber(row.outgoingOrder)),
    });
  }

  let roundsCompleted = 0;
  for (const role of ROLE_ORDER) {
    const series = (byRoleRounds.get(role) ?? []).sort((a, b) => a.round - b.round);
    ordersByRole[role] = series.map((s) => s.order);
    roundsCompleted = Math.max(roundsCompleted, series.length);
  }

  return {
    id: team.id,
    name: team.name,
    totalCost: toFiniteNumber(team.totalCost),
    roundsCompleted,
    robotCount,
    ordersByRole,
  };
}

/** Cheapest chain wins. Ties break on name so the order is stable across loads. */
function sortForReporting(teams: readonly TeamAnalytics[]): TeamAnalytics[] {
  return [...teams].sort((a, b) => {
    const byCost = a.totalCost - b.totalCost;
    if (byCost !== 0) return byCost;
    return a.name.localeCompare(b.name);
  });
}

export function buildLeaderboardRows(
  teams: readonly TeamAnalytics[],
): LeaderboardRow[] {
  return sortForReporting(teams).map((team, index) => ({
    rank: index + 1,
    teamId: team.id,
    teamName: team.name,
    totalCost: team.totalCost,
    roundsCompleted: team.roundsCompleted,
    robotCount: team.robotCount,
    bullwhip: computeBullwhip(team.ordersByRole),
  }));
}

export function buildStdDevRows(teams: readonly TeamAnalytics[]): StdDevRow[] {
  return sortForReporting(teams).map((team) => ({
    teamId: team.id,
    teamName: team.name,
    byRole: Object.fromEntries(
      ROLE_ORDER.map((role) => [role, standardDeviation(team.ordersByRole[role])]),
    ) as Record<BeerGameRole, number>,
  }));
}

/** One formatter so the on-screen table and the CSV never disagree. */
export function formatBullwhip(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(2);
}

/**
 * Fixed y-axis for the order charts. siemsene pins this deliberately: with a
 * shared scale you can eyeball two teams side by side, whereas auto-scaling
 * makes a calm chain and a wild one look identical.
 */
export const ORDER_CHART_Y_MAX = 25;
