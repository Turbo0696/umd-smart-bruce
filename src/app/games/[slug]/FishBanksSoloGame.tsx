"use client";

import { useState } from "react";
import { LineChart } from "@/components/LineChart";
import {
  DEFAULT_CONFIG,
  resolveFishBanksRound,
  type FishBanksConfig,
  type TeamDecision,
  type TeamStateBefore,
} from "@/lib/fishBanks";

type TeamId = "human" | "ai1" | "ai2" | "ai3";
type Personality = "aggressive" | "cautious" | "opportunist";

const AI_TEAMS: { id: TeamId; name: string; personality: Personality; blurb: string }[] = [
  {
    id: "ai1",
    name: "Northern Fleet Co.",
    personality: "aggressive",
    blurb: "Chases the most profitable zone with its whole fleet and reinvests every surplus into new ships.",
  },
  {
    id: "ai2",
    name: "Tidewater Marine",
    personality: "cautious",
    blurb: "Splits its fleet across both zones and scraps ships early if a stock looks shaky.",
  },
  {
    id: "ai3",
    name: "Saltwind Fisheries",
    personality: "opportunist",
    blurb: "Copies whichever zone paid off best for it last round.",
  },
];

const TEAM_COLORS: Record<TeamId, string> = {
  human: "#2563eb",
  ai1: "#dc2626",
  ai2: "#16a34a",
  ai3: "#d97706",
};

type TeamState = { id: TeamId; name: string; cash: number; ships: number };

type RoundLogEntry = {
  round: number;
  price: number;
  coastalStock: number;
  deepSeaStock: number;
  teams: Record<TeamId, { profit: number; cash: number; ships: number; netWorth: number }>;
};

type LastCatch = Record<TeamId, { coastal: number; deepSea: number }>;

function initialTeams(config: FishBanksConfig): TeamState[] {
  return [
    { id: "human", name: "Your Company", cash: config.startingCash, ships: config.startingShips },
    ...AI_TEAMS.map((t) => ({
      id: t.id,
      name: t.name,
      cash: config.startingCash,
      ships: config.startingShips,
    })),
  ];
}

function aiDecision(
  team: TeamState,
  personality: Personality,
  coastalStock: number,
  deepSeaStock: number,
  lastPrice: number,
  lastCatch: { coastal: number; deepSea: number } | null,
  config: FishBanksConfig,
): TeamDecision {
  const coastalExpected =
    Math.min(config.coastalCatchability * coastalStock, config.maxCatchPerShipCoastal) * lastPrice -
    config.costPerShipCoastal;
  const deepExpected =
    Math.min(config.deepSeaCatchability * deepSeaStock, config.maxCatchPerShipDeepSea) * lastPrice -
    config.costPerShipDeepSea;

  let shipsCoastal = 0;
  let shipsDeepSea = 0;
  let buildShips = 0;
  let scrapShips = 0;

  if (personality === "aggressive") {
    if (coastalExpected >= deepExpected) shipsCoastal = team.ships;
    else shipsDeepSea = team.ships;
    if (team.cash > config.shipBuildCost * 2) buildShips = 1;
    if (coastalStock < config.coastalCapacity * 0.05 && deepSeaStock < config.deepSeaCapacity * 0.05) {
      scrapShips = Math.floor(team.ships / 2);
    }
  } else if (personality === "cautious") {
    shipsCoastal = Math.ceil(team.ships / 2);
    shipsDeepSea = Math.floor(team.ships / 2);
    if (team.cash > config.shipBuildCost * 4) buildShips = 1;
    if (coastalStock < config.coastalCapacity * 0.2 || deepSeaStock < config.deepSeaCapacity * 0.2) {
      scrapShips = 1;
    }
  } else {
    const preferCoastal = lastCatch
      ? lastCatch.coastal >= lastCatch.deepSea
      : coastalExpected >= deepExpected;
    if (preferCoastal) shipsCoastal = team.ships;
    else shipsDeepSea = team.ships;
    const lastCatchTotal = lastCatch ? lastCatch.coastal + lastCatch.deepSea : 0;
    if (lastCatchTotal > 0 && team.cash > config.shipBuildCost * 1.5) buildShips = 1;
    if (lastPrice < config.minPrice * 1.2 && Math.random() < 0.3) scrapShips = 1;
  }

  return { shipsCoastal, shipsDeepSea, buildShips, scrapShips };
}

export function FishBanksSoloGame() {
  const [config] = useState<FishBanksConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<"intro" | "deciding" | "resolved" | "complete">("intro");
  const [round, setRound] = useState(1);
  const [coastalStock, setCoastalStock] = useState(config.startingCoastalStock);
  const [deepSeaStock, setDeepSeaStock] = useState(config.startingDeepSeaStock);
  const [teams, setTeams] = useState<TeamState[]>(() => initialTeams(config));
  const [lastPrice, setLastPrice] = useState(config.basePrice);
  const [lastCatch, setLastCatch] = useState<LastCatch | null>(null);
  const [log, setLog] = useState<RoundLogEntry[]>([]);
  const [lastRoundLog, setLastRoundLog] = useState<RoundLogEntry | null>(null);

  const [shipsCoastal, setShipsCoastal] = useState(Math.ceil(config.startingShips / 2));
  const [shipsDeepSea, setShipsDeepSea] = useState(Math.floor(config.startingShips / 2));
  const [buildShips, setBuildShips] = useState(0);
  const [scrapShips, setScrapShips] = useState(0);

  const human = teams.find((t) => t.id === "human")!;

  function start() {
    const fresh = initialTeams(config);
    setTeams(fresh);
    setRound(1);
    setCoastalStock(config.startingCoastalStock);
    setDeepSeaStock(config.startingDeepSeaStock);
    setLastPrice(config.basePrice);
    setLastCatch(null);
    setLog([]);
    setLastRoundLog(null);
    setShipsCoastal(Math.ceil(config.startingShips / 2));
    setShipsDeepSea(Math.floor(config.startingShips / 2));
    setBuildShips(0);
    setScrapShips(0);
    setPhase("deciding");
  }

  function submitRound(e: React.FormEvent) {
    e.preventDefault();

    const humanDecision: TeamDecision = { shipsCoastal, shipsDeepSea, buildShips, scrapShips };
    const before: TeamStateBefore[] = [
      { id: "human", cash: human.cash, ships: human.ships, decision: humanDecision },
      ...AI_TEAMS.map((ai) => {
        const state = teams.find((t) => t.id === ai.id)!;
        return {
          id: ai.id,
          cash: state.cash,
          ships: state.ships,
          decision: aiDecision(
            state,
            ai.personality,
            coastalStock,
            deepSeaStock,
            lastPrice,
            lastCatch?.[ai.id] ?? null,
            config,
          ),
        };
      }),
    ];

    const outcome = resolveFishBanksRound(before, coastalStock, deepSeaStock, config);

    const nextTeams = teams.map((t) => {
      const o = outcome.teams.find((r) => r.id === t.id)!;
      return { ...t, cash: o.cash, ships: o.ships };
    });
    const nextCatch: LastCatch = {} as LastCatch;
    for (const o of outcome.teams) {
      nextCatch[o.id as TeamId] = { coastal: o.catchCoastal, deepSea: o.catchDeepSea };
    }

    const entry: RoundLogEntry = {
      round,
      price: outcome.market.price,
      coastalStock: outcome.market.coastalStock,
      deepSeaStock: outcome.market.deepSeaStock,
      teams: Object.fromEntries(
        outcome.teams.map((o) => [
          o.id,
          { profit: o.profit, cash: o.cash, ships: o.ships, netWorth: o.netWorth },
        ]),
      ) as RoundLogEntry["teams"],
    };

    setTeams(nextTeams);
    setCoastalStock(outcome.market.coastalStock);
    setDeepSeaStock(outcome.market.deepSeaStock);
    setLastPrice(outcome.market.price);
    setLastCatch(nextCatch);
    setLog((l) => [...l, entry]);
    setLastRoundLog(entry);
    setPhase("resolved");
  }

  function continueToNext() {
    if (round >= config.totalRounds) {
      setPhase("complete");
      return;
    }
    const nextRound = round + 1;
    setRound(nextRound);
    setShipsCoastal(Math.ceil(human.ships / 2));
    setShipsDeepSea(Math.floor(human.ships / 2));
    setBuildShips(0);
    setScrapShips(0);
    setPhase("deciding");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Fish Banks (Solo vs. AI)
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Run your own fishing company against three AI-controlled rivals, all
        drawing from the same two shared fish stocks. No login required —
        this game lives entirely in your browser tab.
      </p>

      {phase === "intro" && (
        <div className="mt-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Your competitors</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {AI_TEAMS.map((t) => (
              <li key={t.id}>
                <strong className="text-zinc-900 dark:text-zinc-50">{t.name}</strong> — {t.blurb}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Rounds" value={config.totalRounds} />
            <Stat label="Starting cash" value={`$${config.startingCash.toLocaleString()}`} />
            <Stat label="Starting ships" value={config.startingShips} />
            <Stat label="Ship cost / scrap" value={`$${config.shipBuildCost} / $${config.shipScrapValue}`} />
          </div>
          <button
            onClick={start}
            className="mt-5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start game
          </button>
        </div>
      )}

      {(phase === "deciding" || phase === "resolved") && (
        <>
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
            Round {round} of {config.totalRounds}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Coastal stock" value={`${Math.round(coastalStock)} t`} />
            <Stat label="Deep sea stock" value={`${Math.round(deepSeaStock)} t`} />
            <Stat label="Price" value={`$${lastPrice.toFixed(1)}/t`} />
            <Stat label="Your cash" value={`$${Math.round(human.cash).toLocaleString()}`} />
          </div>

          {phase === "resolved" && lastRoundLog && (
            <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-500">
                Round {lastRoundLog.round} results
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 dark:text-zinc-500">
                    <th className="pb-1 font-normal">Company</th>
                    <th className="pb-1 font-normal">Profit</th>
                    <th className="pb-1 font-normal">Cash</th>
                    <th className="pb-1 font-normal">Ships</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const r = lastRoundLog.teams[t.id];
                    return (
                      <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                          {t.name} {t.id === "human" && "(you)"}
                        </td>
                        <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                          ${Math.round(r.profit).toLocaleString()}
                        </td>
                        <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                          ${Math.round(r.cash).toLocaleString()}
                        </td>
                        <td className="py-1.5 text-zinc-700 dark:text-zinc-300">{r.ships}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button
                onClick={continueToNext}
                className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {round >= config.totalRounds ? "See final results" : "Continue to next round"}
              </button>
            </div>
          )}

          {phase === "deciding" && (
            <form onSubmit={submitRound} className="mt-6 flex flex-col gap-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {human.ships} ship{human.ships === 1 ? "" : "s"} on hand
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                  label="Send to coastal"
                  value={shipsCoastal}
                  onChange={setShipsCoastal}
                />
                <NumberField
                  label="Send to deep sea"
                  value={shipsDeepSea}
                  onChange={setShipsDeepSea}
                />
                <NumberField
                  label={`Build ($${config.shipBuildCost} ea)`}
                  value={buildShips}
                  onChange={setBuildShips}
                />
                <NumberField
                  label={`Scrap ($${config.shipScrapValue} ea)`}
                  value={scrapShips}
                  onChange={setScrapShips}
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                If coastal + deep sea exceeds what you own after building/scrapping,
                it&apos;s scaled down automatically.
              </p>
              <button
                type="submit"
                className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Submit round
              </button>
            </form>
          )}
        </>
      )}

      {phase === "complete" && (
        <FinalResults teams={teams} log={log} config={config} onRestart={start} />
      )}
    </div>
  );
}

function FinalResults({
  teams,
  log,
  config,
  onRestart,
}: {
  teams: TeamState[];
  log: RoundLogEntry[];
  config: FishBanksConfig;
  onRestart: () => void;
}) {
  const finalNetWorth: Record<TeamId, number> = {} as Record<TeamId, number>;
  const lastEntry = log[log.length - 1];
  for (const t of teams) {
    finalNetWorth[t.id] = lastEntry?.teams[t.id]?.netWorth ?? t.cash + t.ships * config.shipScrapValue;
  }
  const leaderboard = [...teams].sort((a, b) => finalNetWorth[b.id] - finalNetWorth[a.id]);
  const humanRank = leaderboard.findIndex((t) => t.id === "human") + 1;

  const finalCoastal = lastEntry?.coastalStock ?? config.startingCoastalStock;
  const finalDeepSea = lastEntry?.deepSeaStock ?? config.startingDeepSeaStock;
  const collapsed = finalCoastal < 5 || finalDeepSea < 50;

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Game complete — you finished #{humanRank} of {teams.length}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        {collapsed
          ? "At least one fish stock is nearly wiped out — the classic Fishbanks outcome when the whole industry's effort outgrows what the stock can regrow."
          : "Both stocks are still in reasonable shape — this industry managed the commons better than most."}
        {" "}Final coastal stock: {Math.round(finalCoastal)}t · final deep sea
        stock: {Math.round(finalDeepSea)}t.
      </p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Net worth by round
        </p>
        <LineChart
          series={teams.map((t) => ({
            label: t.name,
            color: TEAM_COLORS[t.id],
            points: log.map((entry) => entry.teams[t.id]?.netWorth ?? 0),
          }))}
        />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Fish stock by round
        </p>
        <LineChart
          series={[
            { label: "Coastal stock", color: "#0891b2", points: log.map((e) => e.coastalStock) },
            { label: "Deep sea stock", color: "#1d4ed8", points: log.map((e) => e.deepSeaStock) },
          ]}
        />
      </div>

      <h3 className="mt-8 font-semibold text-zinc-900 dark:text-zinc-50">
        Final standings (net worth)
      </h3>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {leaderboard.map((t) => (
            <tr key={t.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-2 text-zinc-700 dark:text-zinc-300">
                {t.name} {t.id === "human" && "(you)"}
              </td>
              <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                ${Math.round(finalNetWorth[t.id]).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={onRestart}
        className="mt-6 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Play again
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
