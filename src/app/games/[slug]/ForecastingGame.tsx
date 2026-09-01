"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/LineChart";
import {
  computeForecast,
  explain,
  METHOD_HINTS,
  METHOD_LABELS,
  METHOD_ORDER,
  percentError,
  scoreFor,
  type ForecastMethod,
} from "@/lib/forecasting";
import { FORECAST_DATASETS, type ForecastDataset } from "@/lib/forecastingDatasets";
import { logForecastAttempt } from "./forecasting-actions";

type PersonalStats = {
  rounds: number;
  avgScore: number;
  byMethod: { method: ForecastMethod; rounds: number; avgScore: number }[];
};

type ClassStatsRow = {
  userId: string;
  name: string;
  rounds: number;
  avgScore: number;
};

function pickDataset(): ForecastDataset {
  return FORECAST_DATASETS[Math.floor(Math.random() * FORECAST_DATASETS.length)];
}

export function ForecastingGame({
  isLoggedIn,
  stats,
  classStats,
}: {
  isLoggedIn: boolean;
  stats: PersonalStats | null;
  classStats: ClassStatsRow[] | null;
}) {
  const [methodIndex, setMethodIndex] = useState(0);
  // Deterministic initial dataset — SSR and the first client render must
  // match exactly, or React throws a hydration mismatch. The real random
  // pick happens client-only, after mount (see effect below).
  const [dataset, setDataset] = useState<ForecastDataset>(FORECAST_DATASETS[0]);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{
    correct: number;
    pctError: number;
    score: number;
    explanation: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Deliberate: randomize only after mount so SSR and the first client
    // render match exactly (see the comment on the dataset useState above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataset(pickDataset());
  }, []);

  const method: ForecastMethod = METHOD_ORDER[methodIndex];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const userForecast = Number(input);
    if (!Number.isFinite(userForecast)) return;

    const correct = computeForecast(method, dataset.values);
    const pctError = percentError(userForecast, correct);
    const score = scoreFor(pctError);
    const explanation = explain(method, dataset.values);

    setResult({ correct, pctError, score, explanation });
    setSaveError(null);

    if (isLoggedIn) {
      logForecastAttempt(method, dataset.slug, userForecast, correct, pctError, score).catch(
        () => setSaveError("Couldn't save this round — your score above is still correct."),
      );
    }
  }

  function nextRound() {
    setMethodIndex((i) => (i + 1) % METHOD_ORDER.length);
    setDataset(pickDataset());
    setInput("");
    setResult(null);
    setSaveError(null);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Forecasting Practice
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Compute a forecast by hand, then check your work. Rounds cycle
        through five standard forecasting methods.
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
            score {stats.avgScore.toFixed(0)}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-zinc-600 dark:text-zinc-400">
            {stats.byMethod.map((m) => (
              <li key={m.method}>
                {METHOD_LABELS[m.method]}: {m.avgScore.toFixed(0)} avg ({m.rounds})
              </li>
            ))}
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
                      {row.avgScore.toFixed(0)} avg
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
          {dataset.name}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {dataset.description}
        </p>

        <div className="mt-4">
          <LineChart
            series={[
              { label: dataset.name, color: "#2563eb", points: dataset.values },
            ]}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 dark:text-zinc-500">
                {dataset.values.map((_, i) => (
                  <th key={i} className="px-1.5 py-1 font-normal">
                    P{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-zinc-900 dark:text-zinc-50">
                {dataset.values.map((v, i) => (
                  <td key={i} className="px-1.5 py-1">
                    {v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Method: {METHOD_LABELS[method]}
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {METHOD_HINTS[method]}
          </p>
        </div>

        {result ? (
          <div className="mt-5">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Your forecast: <strong>{input}</strong> {dataset.unit} · Correct:{" "}
              <strong>{result.correct.toFixed(2)}</strong> {dataset.unit} · Error:{" "}
              <strong>{result.pctError.toFixed(1)}%</strong>
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {result.explanation}
            </p>
            <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-50">
              Score: {result.score} / 100
            </p>
            {saveError && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                {saveError}
              </p>
            )}
            <button
              onClick={nextRound}
              className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Next round
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Your forecast for period {dataset.values.length + 1} ({dataset.unit})
              <input
                type="number"
                step="any"
                required
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Check my answer
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
