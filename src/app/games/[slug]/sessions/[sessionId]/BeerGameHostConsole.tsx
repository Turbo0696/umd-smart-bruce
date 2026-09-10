// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Live host console. The dense one-row-per-team layout is deliberate: it is
// what siemsene/beergame's own notes describe reworking specifically to keep
// 50-100 players legible on one screen. See NOTICE.md for attribution.

import { PollingRefresher } from "@/components/PollingRefresher";
import {
  ROBOT_NAME,
  ROLE_LABELS,
  ROLE_ORDER,
  type BeerGameRole,
} from "@/lib/beerGame";
import { endSessionEarly, kickToRobot } from "./actions";

export type HostSeat = {
  slotId: string;
  role: BeerGameRole;
  isRobot: boolean;
  playerName: string | null;
  hasSubmitted: boolean;
};

export type HostTeamRow = {
  id: string;
  name: string;
  round: number;
  totalCost: number;
  finished: boolean;
  seats: HostSeat[];
};

export function BeerGameHostConsole({
  slug,
  sessionId,
  teams,
  totalRounds,
}: {
  slug: string;
  sessionId: string;
  teams: HostTeamRow[];
  totalRounds: number;
}) {
  const totalSeats = teams.length * ROLE_ORDER.length;
  const robotSeats = teams.reduce(
    (n, t) => n + t.seats.filter((s) => s.isRobot).length,
    0,
  );
  const waitingSeats = teams.reduce(
    (n, t) =>
      n +
      t.seats.filter((s) => !s.isRobot && !s.hasSubmitted && !t.finished).length,
    0,
  );
  const finishedTeams = teams.filter((t) => t.finished).length;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Running {teams.length} {teams.length === 1 ? "chain" : "chains"}
        </h2>
        <Chip>{totalSeats - robotSeats} players</Chip>
        <Chip>
          {robotSeats} {ROBOT_NAME}
        </Chip>
        <Chip emphasis={waitingSeats > 0}>
          {waitingSeats === 0
            ? "Nobody waiting"
            : `${waitingSeats} yet to decide`}
        </Chip>
        <Chip>
          {finishedTeams}/{teams.length} finished
        </Chip>
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Chains advance on their own as soon as everyone on that chain has
        ordered, so a slow table never holds up the class. If someone is stuck or
        has left, hand their seat to {ROBOT_NAME} and their chain moves on.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium text-zinc-500 dark:text-zinc-500">
                Chain
              </th>
              <th className="py-2 pr-3 font-medium text-zinc-500 dark:text-zinc-500">
                Round
              </th>
              <th className="py-2 pr-3 font-medium text-zinc-500 dark:text-zinc-500">
                Cost
              </th>
              {ROLE_ORDER.map((role) => (
                <th
                  key={role}
                  className="py-2 pr-3 font-medium text-zinc-500 dark:text-zinc-500"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr
                key={team.id}
                className="border-b border-zinc-100 align-top dark:border-zinc-800"
              >
                <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-50">
                  {team.name}
                </td>
                <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                  {team.finished ? "done" : `${team.round}/${totalRounds}`}
                </td>
                <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                  ${team.totalCost.toFixed(2)}
                </td>
                {ROLE_ORDER.map((role) => {
                  const seat = team.seats.find((s) => s.role === role);
                  if (!seat) {
                    return (
                      <td key={role} className="py-2 pr-3 text-zinc-400">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={role} className="py-2 pr-3">
                      <SeatCell
                        slug={slug}
                        sessionId={sessionId}
                        seat={seat}
                        teamFinished={team.finished}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        action={endSessionEarly.bind(null, slug, sessionId)}
        className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40"
      >
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Ending now scores every chain on the rounds it has actually played —
          nothing is fast-forwarded, and the results stay available afterwards.
        </p>
        <button
          type="submit"
          className="mt-3 rounded-full border border-amber-300 bg-white px-5 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          End game now
        </button>
      </form>

      <PollingRefresher />
    </div>
  );
}

function SeatCell({
  slug,
  sessionId,
  seat,
  teamFinished,
}: {
  slug: string;
  sessionId: string;
  seat: HostSeat;
  teamFinished: boolean;
}) {
  if (seat.isRobot) {
    return (
      <span className="text-zinc-500 dark:text-zinc-500">{ROBOT_NAME}</span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={
          !seat.hasSubmitted && !teamFinished
            ? "font-medium text-amber-700 dark:text-amber-400"
            : "text-zinc-700 dark:text-zinc-300"
        }
      >
        {seat.playerName ?? "Unnamed"}
      </span>
      {!teamFinished && (
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {seat.hasSubmitted ? "ordered" : "deciding…"}
        </span>
      )}
      {!teamFinished && (
        <form action={kickToRobot.bind(null, slug, sessionId, seat.slotId)}>
          <button
            type="submit"
            className="rounded-full px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            title={`Hand this seat to ${ROBOT_NAME} — use for a duplicate sign-in or a player who has left`}
          >
            → {ROBOT_NAME}
          </button>
        </form>
      )}
    </div>
  );
}

function Chip({
  children,
  emphasis = false,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        emphasis
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {children}
    </span>
  );
}
