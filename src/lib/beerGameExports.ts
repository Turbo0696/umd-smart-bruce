// SPDX-License-Identifier: CC-BY-SA-4.0
//
// The set of session exports mirrors the files in siemsene/beergame's CSV ZIP
// (session, leaderboard, team_role_stddev, team_orders, players), served as
// separate downloads rather than a zip so no archiving dependency is needed.
// See NOTICE.md for attribution.

export const EXPORT_KINDS = [
  "session",
  "leaderboard",
  "stddev",
  "orders",
  "players",
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

const LABELS: Record<ExportKind, string> = {
  session: "Full round-by-round data",
  leaderboard: "Leaderboard",
  stddev: "Order swing by role",
  orders: "Orders by chain",
  players: "Player list",
};

export function exportLabel(kind: ExportKind): string {
  return LABELS[kind];
}
