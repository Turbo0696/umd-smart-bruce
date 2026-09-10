// SPDX-License-Identifier: CC-BY-SA-4.0
import { describe, expect, it } from "vitest";
import { ROLE_ORDER, type BeerGameRole } from "@/lib/beerGame";
import {
  TEAM_NAME_POOL,
  TEAM_SIZE,
  assignTeams,
  countRobotSlots,
  pickTeamForLateJoin,
  previewCohort,
  shuffled,
  teamNameForIndex,
} from "@/lib/beerGameTeams";

/** Deterministic stand-in for Math.random so assignments are reproducible. */
function seededRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

describe("previewCohort", () => {
  it("shows what the roster will divide into before the host starts", () => {
    expect(previewCohort(0)).toEqual({ teams: 0, robots: 0 });
    expect(previewCohort(1)).toEqual({ teams: 1, robots: 3 });
    expect(previewCohort(4)).toEqual({ teams: 1, robots: 0 });
    expect(previewCohort(5)).toEqual({ teams: 2, robots: 3 });
    // The motivating case: one join code for a class of 50.
    expect(previewCohort(50)).toEqual({ teams: 13, robots: 2 });
  });
});

describe("assignTeams", () => {
  it("returns nothing for an empty roster", () => {
    expect(assignTeams([])).toEqual([]);
  });

  it("fills a single team of four with no robots", () => {
    const teams = assignTeams(ids(4), { random: seededRandom() });
    expect(teams).toHaveLength(1);
    expect(teams[0].slots.map((s) => s.role)).toEqual(ROLE_ORDER);
    expect(teams[0].slots.every((s) => s.participantId !== null)).toBe(true);
  });

  it("gives a lone player a full chain of three robots", () => {
    const teams = assignTeams(ids(1), { random: seededRandom() });
    expect(teams).toHaveLength(1);
    const humans = teams[0].slots.filter((s) => s.participantId !== null);
    expect(humans).toHaveLength(1);
    expect(teams[0].slots.filter((s) => s.participantId === null)).toHaveLength(3);
  });

  it("splits five players into a full team and a mostly-robot team", () => {
    const teams = assignTeams(ids(5), { random: seededRandom() });
    expect(teams).toHaveLength(2);
    const humanCounts = teams.map(
      (t) => t.slots.filter((s) => s.participantId !== null).length,
    );
    expect(humanCounts).toEqual([4, 1]);
  });

  it("divides a class of 50 into 13 teams with 2 robots in the last", () => {
    const teams = assignTeams(ids(50), { random: seededRandom() });
    expect(teams).toHaveLength(13);
    const last = teams[12].slots;
    expect(last.filter((s) => s.participantId !== null)).toHaveLength(2);
    expect(last.filter((s) => s.participantId === null)).toHaveLength(2);
  });

  it("seats every participant exactly once", () => {
    const roster = ids(50);
    const teams = assignTeams(roster, { random: seededRandom(7) });
    const seated = teams.flatMap((t) =>
      t.slots.map((s) => s.participantId).filter((id): id is string => id !== null),
    );
    expect(seated).toHaveLength(roster.length);
    expect(new Set(seated).size).toBe(roster.length);
    expect([...seated].sort()).toEqual([...roster].sort());
  });

  it("always lays slots out in canonical role order", () => {
    for (const team of assignTeams(ids(9), { random: seededRandom(3) })) {
      expect(team.slots.map((s) => s.role)).toEqual(ROLE_ORDER);
    }
  });

  it("gives every team a distinct name", () => {
    const teams = assignTeams(ids(200), { random: seededRandom() });
    const names = teams.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("continues the name sequence from startIndex", () => {
    const teams = assignTeams(ids(4), { random: seededRandom(), startIndex: 3 });
    expect(teams[0].name).toBe(TEAM_NAME_POOL[3]);
  });

  it("actually shuffles rather than seating players in roster order", () => {
    const roster = ids(40);
    const teams = assignTeams(roster, { random: seededRandom(99) });
    const seated = teams.flatMap((t) => t.slots.map((s) => s.participantId));
    expect(seated).not.toEqual(roster);
  });
});

describe("teamNameForIndex", () => {
  it("uses the pool directly on the first lap", () => {
    expect(teamNameForIndex(0)).toBe(TEAM_NAME_POOL[0]);
    expect(teamNameForIndex(TEAM_NAME_POOL.length - 1)).toBe(
      TEAM_NAME_POOL[TEAM_NAME_POOL.length - 1],
    );
  });

  it("suffixes on later laps so names stay unique", () => {
    expect(teamNameForIndex(TEAM_NAME_POOL.length)).toBe(`${TEAM_NAME_POOL[0]} 2`);
    expect(teamNameForIndex(TEAM_NAME_POOL.length * 2)).toBe(`${TEAM_NAME_POOL[0]} 3`);
  });

  it("never collides across several laps", () => {
    const names = Array.from({ length: TEAM_NAME_POOL.length * 3 }, (_, i) =>
      teamNameForIndex(i),
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("shuffled", () => {
  it("is a permutation, not a mutation of the input", () => {
    const input = ids(20);
    const snapshot = [...input];
    const out = shuffled(input, seededRandom(5));
    expect(input).toEqual(snapshot);
    expect([...out].sort()).toEqual([...snapshot].sort());
  });
});

describe("pickTeamForLateJoin", () => {
  const slot = (role: BeerGameRole, isRobot: boolean) => ({
    id: `${role}-slot`,
    role,
    isRobot,
  });

  function makeTeam(
    id: string,
    createdAt: string,
    robotRoles: BeerGameRole[],
  ) {
    return {
      id,
      createdAt: new Date(createdAt),
      slots: ROLE_ORDER.map((role) => slot(role, robotRoles.includes(role))),
    };
  }

  it("returns null when every seat already has a human", () => {
    expect(pickTeamForLateJoin([makeTeam("a", "2026-01-01", [])])).toBeNull();
  });

  it("returns null for a session with no teams", () => {
    expect(pickTeamForLateJoin([])).toBeNull();
  });

  it("prefers the team carrying the most robots, to even the cohort out", () => {
    const target = pickTeamForLateJoin([
      makeTeam("one-robot", "2026-01-01", ["FACTORY"]),
      makeTeam("three-robots", "2026-01-02", ["WHOLESALER", "DISTRIBUTOR", "FACTORY"]),
    ]);
    expect(target?.teamId).toBe("three-robots");
  });

  it("breaks a tie on the older team", () => {
    const target = pickTeamForLateJoin([
      makeTeam("newer", "2026-03-01", ["FACTORY"]),
      makeTeam("older", "2026-01-01", ["FACTORY"]),
    ]);
    expect(target?.teamId).toBe("older");
  });

  it("picks the robot seat earliest in role order, for a deterministic result", () => {
    const target = pickTeamForLateJoin([
      makeTeam("a", "2026-01-01", ["FACTORY", "WHOLESALER"]),
    ]);
    expect(target?.role).toBe("WHOLESALER");
    expect(target?.slotId).toBe("WHOLESALER-slot");
  });

  it("does not depend on the order the database returned the teams", () => {
    const teams = [
      makeTeam("a", "2026-01-01", ["FACTORY"]),
      makeTeam("b", "2026-01-02", ["DISTRIBUTOR", "FACTORY"]),
      makeTeam("c", "2026-01-03", ["WHOLESALER"]),
    ];
    const forwards = pickTeamForLateJoin(teams);
    const backwards = pickTeamForLateJoin([...teams].reverse());
    expect(forwards).toEqual(backwards);
  });
});

describe("countRobotSlots", () => {
  it("counts only robot seats", () => {
    expect(countRobotSlots([])).toBe(0);
    expect(
      countRobotSlots([{ isRobot: true }, { isRobot: false }, { isRobot: true }]),
    ).toBe(2);
  });
});

describe("TEAM_SIZE", () => {
  it("matches the number of roles in a supply chain", () => {
    expect(TEAM_SIZE).toBe(4);
    expect(TEAM_SIZE).toBe(ROLE_ORDER.length);
  });
});
