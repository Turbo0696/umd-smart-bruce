// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Endgame report: leaderboard, bullwhip, per-role order dispersion and per-chain
// order charts. Ported in substance from siemsene/beergame's ended-session
// analytics panel. See NOTICE.md for attribution.

import { GroupedBarChart } from "@/components/GroupedBarChart";
import { LineChart } from "@/components/LineChart";
import {
  ROBOT_NAME,
  ROLE_COLORS,
  ROLE_LABELS,
  ROLE_ORDER,
} from "@/lib/beerGame";
import {
  ORDER_CHART_Y_MAX,
  buildLeaderboardRows,
  buildStdDevRows,
  formatBullwhip,
  type TeamAnalytics,
} from "@/lib/beerGameAnalytics";
import { EXPORT_KINDS, exportLabel } from "@/lib/beerGameExports";

export function BeerGameReport({
  slug,
  sessionId,
  teams,
  totalRounds,
  viewerTeamId,
  canManage,
}: {
  slug: string;
  sessionId: string;
  teams: TeamAnalytics[];
  totalRounds: number;
  viewerTeamId: string | null;
  canManage: boolean;
}) {
  if (teams.length === 0) {
    return (
      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
        This session ended before any chains were drawn, so there are no results
        to show.
      </p>
    );
  }

  const leaderboard = buildLeaderboardRows(teams);
  const stdDevRows = buildStdDevRows(teams);
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const ragged = leaderboard.some((r) => r.roundsCompleted !== totalRounds);

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Results</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Cheapest chain wins. The bullwhip column is how much more the factory&apos;s
        orders swung than the retailer&apos;s — above 1 means the distortion grew as
        it travelled upstream, which is the whole lesson of the game.
      </p>
      {ragged && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
          Some chains played fewer than {totalRounds} rounds. Each is scored on
          the rounds it actually played, so compare cost per round rather than
          totals.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <Th>#</Th>
              <Th>Chain</Th>
              <Th align="right">Total cost</Th>
              <Th align="right">Rounds</Th>
              <Th align="right">{ROBOT_NAME}</Th>
              <Th align="right">Bullwhip</Th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => {
              const isViewer = row.teamId === viewerTeamId;
              return (
                <tr
                  key={row.teamId}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${
                    isViewer ? "bg-zinc-50 dark:bg-zinc-900/60" : ""
                  }`}
                >
                  <Td>{row.rank}</Td>
                  <Td>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {row.teamName}
                    </span>
                    {isViewer && (
                      <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                        (yours)
                      </span>
                    )}
                  </Td>
                  <Td align="right">${row.totalCost.toFixed(2)}</Td>
                  <Td align="right">{row.roundsCompleted}</Td>
                  <Td align="right">{row.robotCount}</Td>
                  <Td align="right">{formatBullwhip(row.bullwhip)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {teams.length > 1 && (
        <section className="mt-10">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Order swing by role
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Standard deviation of each role&apos;s orders. In a textbook run the
            bars climb from retailer to factory within every chain.
          </p>
          <div className="mt-4">
            <GroupedBarChart
              groups={stdDevRows.map((row) => ({
                label: row.teamName,
                values: ROLE_ORDER.map((role) => row.byRole[role]),
              }))}
              series={ROLE_ORDER.map((role) => ({
                label: ROLE_LABELS[role],
                color: ROLE_COLORS[role],
              }))}
            />
          </div>
        </section>
      )}

      <section className="mt-10">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Orders placed, chain by chain
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          All charts share a y-axis so you can compare them directly.
        </p>
        <div className="mt-4 grid gap-8">
          {leaderboard.map((row) => {
            const team = teamsById.get(row.teamId);
            if (!team) return null;
            return (
              <div key={row.teamId}>
                <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {row.teamName}
                  <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-500">
                    ${row.totalCost.toFixed(2)} · bullwhip{" "}
                    {formatBullwhip(row.bullwhip)}
                  </span>
                </h4>
                <div className="mt-2">
                  <LineChart
                    minAxisMax={ORDER_CHART_Y_MAX}
                    series={ROLE_ORDER.map((role) => ({
                      label: ROLE_LABELS[role],
                      color: ROLE_COLORS[role],
                      points: team.ordersByRole[role],
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canManage && (
        <section className="mt-10 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800 print:hidden">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Download the data
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            One CSV per view. For a PDF, print this page — the layout is set up
            for it and your browser will offer &ldquo;Save as PDF&rdquo;.
          </p>
          {/* Plain anchors, not next/link: these hit a route handler that
              returns a file download, and client-side navigation would try to
              render the CSV as a page instead of saving it. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {EXPORT_KINDS.map((kind) => (
              <a
                key={kind}
                download
                href={`/games/${slug}/sessions/${sessionId}/export/${kind}`}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {exportLabel(kind)}
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        Classroom format adapted from{" "}
        <a
          className="underline"
          href="https://github.com/siemsene/beergame"
          target="_blank"
          rel="noreferrer"
        >
          The Beer Game
        </a>{" "}
        by GitHub user siemsene, licensed{" "}
        <a
          className="underline"
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 4.0
        </a>
        ; modified. The underlying simulation is the classic MIT Sloan beer game
        (Jay Forrester; popularised by John Sterman).
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`py-2 pr-3 font-medium text-zinc-500 dark:text-zinc-500 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`py-2 pr-3 text-zinc-700 dark:text-zinc-300 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </td>
  );
}
