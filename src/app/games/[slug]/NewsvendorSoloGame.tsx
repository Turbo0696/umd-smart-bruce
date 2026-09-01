"use client";

import { useEffect, useState } from "react";
import { optimalOrderQty } from "@/lib/newsvendor";
import {
  NEWSVENDOR_SCENARIOS,
  randomScenario,
  type NewsvendorScenario,
} from "@/lib/newsvendorScenarios";
import { playRound } from "./newsvendor-solo-actions";

type PersonalStats = {
  rounds: number;
  avgProfit: number;
  byScenario: { scenarioSlug: string; rounds: number; avgProfit: number }[];
};

type ClassStatsRow = {
  userId: string;
  name: string;
  rounds: number;
  avgProfit: number;
};

export function NewsvendorSoloGame({
  isLoggedIn,
  stats,
  classStats,
}: {
  isLoggedIn: boolean;
  stats: PersonalStats | null;
  classStats: ClassStatsRow[] | null;
}) {
  // Deterministic initial scenario — SSR and the first client render
  // must match, or React throws a hydration mismatch. The real random
  // pick happens client-only, after mount.
  const [scenario, setScenario] = useState<NewsvendorScenario>(
    NEWSVENDOR_SCENARIOS[0],
  );
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{
    demand: number;
    sold: number;
    leftover: number;
    shortage: number;
    profit: number;
  } | null>(null);
  const [orderQty, setOrderQty] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScenario(randomScenario());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(input);
    if (!Number.isInteger(qty) || qty < 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const outcome = await playRound(scenario.slug, qty);
      setResult(outcome);
      setOrderQty(qty);
    } catch {
      setError("Something went wrong saving that round — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function nextRound() {
    setScenario(randomScenario());
    setInput("");
    setResult(null);
    setOrderQty(null);
    setError(null);
  }

  const optimal = optimalOrderQty(scenario);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Newsvendor Practice
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Decide how much to order before demand is known. Order too little and
        miss sales, order too much and eat the leftovers.
      </p>

      {!isLoggedIn && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to save your progress across rounds.
        </p>
      )}

      {stats && stats.rounds > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Your stats: {stats.rounds} round{stats.rounds === 1 ? "" : "s"}, avg
            profit ${stats.avgProfit.toFixed(2)}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-zinc-600 dark:text-zinc-400">
            {stats.byScenario.map((s) => {
              const name =
                NEWSVENDOR_SCENARIOS.find((sc) => sc.slug === s.scenarioSlug)
                  ?.name ?? s.scenarioSlug;
              return (
                <li key={s.scenarioSlug}>
                  {name}: ${s.avgProfit.toFixed(2)} avg ({s.rounds})
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {classStats && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Class performance
          </p>
          {classStats.length === 0 ? (
            <p className="mt-1 text-zinc-500 dark:text-zinc-500">
              No students have played yet.
            </p>
          ) : (
            <table className="mt-2 w-full">
              <tbody>
                {classStats.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                      {row.name}
                    </td>
                    <td className="py-1.5 text-zinc-500 dark:text-zinc-500">
                      {row.rounds} rounds
                    </td>
                    <td className="py-1.5 text-right text-zinc-900 dark:text-zinc-50">
                      ${row.avgProfit.toFixed(2)} avg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {scenario.name}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {scenario.description}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Price" value={`$${scenario.price}`} />
          <Stat label="Cost" value={`$${scenario.cost}`} />
          <Stat label="Salvage value" value={`$${scenario.salvage}`} />
          <Stat
            label="Demand range"
            value={`${scenario.demandMin}–${scenario.demandMax}`}
          />
        </div>

        {result ? (
          <div className="mt-5">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              You ordered <strong>{orderQty}</strong> {scenario.unit} · Demand
              turned out to be <strong>{result.demand}</strong>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sold" value={result.sold} />
              <Stat label="Leftover" value={result.leftover} />
              <Stat label="Shortage" value={result.shortage} />
              <Stat label="Profit" value={`$${result.profit.toFixed(2)}`} />
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              The theoretical optimal order for this scenario (classic
              newsvendor critical-ratio formula) is{" "}
              <strong>{optimal}</strong> {scenario.unit}.
            </p>
            <button
              onClick={nextRound}
              className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Play again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              How many {scenario.unit} will you order?
              <input
                type="number"
                min={0}
                step={1}
                required
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Ordering..." : "Place order"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
