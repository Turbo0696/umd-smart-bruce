// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Cohort drawing: split a class roster into 4-role supply chains, filling any
// empty seats with Beer-GPT. The approach (random assignment at start, robots
// topping up a short team, late joiners taking over a robot's seat) follows
// siemsene/beergame; the name pool replaces its src/logic/teamNames.ts with
// something at home in Bruce's barnyard. See NOTICE.md for attribution.

import { ROLE_ORDER, type BeerGameRole } from "@/lib/beerGame";

export const TEAM_SIZE = ROLE_ORDER.length;

// Goose-flavoured, because the mascot demands it. Kept short enough to fit a
// dense host table column.
export const TEAM_NAME_POOL: string[] = [
  "Malt Mallards",
  "Hoppy Honkers",
  "Lager Loons",
  "Barley Geese",
  "Pilsner Preeners",
  "Stout Storks",
  "Amber Auks",
  "Porter Plovers",
  "Wheat Widgeons",
  "Draft Drakes",
  "Cask Cranes",
  "Growler Goslings",
  "Foam Flamingos",
  "Keg Kestrels",
  "Yeast Egrets",
  "Brew Buzzards",
  "Hops Herons",
  "Taproom Terns",
  "Nitro Nuthatches",
  "Session Swans",
];

/**
 * Stable, collision-free team names. Past the end of the pool it wraps with a
 * numeric suffix ("Malt Mallards 2"), so a 300-person lecture still gets
 * unique names without exhausting anything.
 */
export function teamNameForIndex(index: number): string {
  const base = TEAM_NAME_POOL[index % TEAM_NAME_POOL.length];
  const lap = Math.floor(index / TEAM_NAME_POOL.length);
  return lap === 0 ? base : `${base} ${lap + 1}`;
}

export type TeamDraft = {
  name: string;
  slots: { role: BeerGameRole; participantId: string | null }[];
};

/** Fisher-Yates, on a copy, with injectable randomness for testing. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draws the cohort: shuffles the roster, deals it into chains of four, and
 * marks leftover seats as robots.
 *
 * A trailing group of one becomes a single human plus three Beer-GPTs rather
 * than being dropped or folded into another team — same as siemsene, and it
 * keeps every student playing a full chain.
 */
export function assignTeams(
  participantIds: readonly string[],
  options: { random?: () => number; startIndex?: number } = {},
): TeamDraft[] {
  const { random = Math.random, startIndex = 0 } = options;
  if (participantIds.length === 0) return [];

  const order = shuffled(participantIds, random);
  const teamCount = Math.ceil(order.length / TEAM_SIZE);
  const drafts: TeamDraft[] = [];

  for (let t = 0; t < teamCount; t++) {
    const members = order.slice(t * TEAM_SIZE, (t + 1) * TEAM_SIZE);
    drafts.push({
      name: teamNameForIndex(startIndex + t),
      slots: ROLE_ORDER.map((role, roleIndex) => ({
        role,
        participantId: members[roleIndex] ?? null,
      })),
    });
  }

  return drafts;
}

export function countRobotSlots(slots: readonly { isRobot: boolean }[]): number {
  return slots.reduce((n, slot) => (slot.isRobot ? n + 1 : n), 0);
}

type TeamForLateJoin = {
  id: string;
  createdAt: Date;
  slots: { id: string; role: BeerGameRole; isRobot: boolean }[];
};

/**
 * Finds a seat for a student who arrived after the host started.
 *
 * Prefers the team carrying the most robots, so late arrivals even the cohort
 * out instead of piling into whichever team was created first. Ties break on
 * creation time, then on the canonical role order, so the choice is
 * deterministic and doesn't depend on however the database returned the rows.
 *
 * Returns null when every seat in the session already has a human in it.
 */
export function pickTeamForLateJoin(
  teams: readonly TeamForLateJoin[],
): { teamId: string; slotId: string; role: BeerGameRole } | null {
  const candidates = teams
    .map((team) => ({ team, robots: countRobotSlots(team.slots) }))
    .filter((c) => c.robots > 0)
    .sort((a, b) => {
      if (b.robots !== a.robots) return b.robots - a.robots;
      const byAge = a.team.createdAt.getTime() - b.team.createdAt.getTime();
      if (byAge !== 0) return byAge;
      return a.team.id.localeCompare(b.team.id);
    });

  const best = candidates[0];
  if (!best) return null;

  const slot = best.team.slots
    .filter((s) => s.isRobot)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))[0];
  if (!slot) return null;

  return { teamId: best.team.id, slotId: slot.id, role: slot.role };
}

/**
 * What the host sees before pressing Start: how the current roster will divide.
 */
export function previewCohort(participantCount: number): {
  teams: number;
  robots: number;
} {
  if (participantCount === 0) return { teams: 0, robots: 0 };
  const teams = Math.ceil(participantCount / TEAM_SIZE);
  return { teams, robots: teams * TEAM_SIZE - participantCount };
}
