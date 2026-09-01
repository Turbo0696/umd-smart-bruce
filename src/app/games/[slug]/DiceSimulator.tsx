"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart } from "@/components/BarChart";

const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 25],
    [75, 25],
    [25, 50],
    [75, 50],
    [25, 75],
    [75, 75],
  ],
};

function Die({ value, size = 64 }: { value: number; size?: number }) {
  const r = size * 0.13;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      <rect
        width={size}
        height={size}
        rx={r}
        ry={r}
        className="fill-zinc-50 dark:fill-zinc-800"
      />
      <rect
        x={2}
        y={2}
        width={size - 4}
        height={size - 4}
        rx={r - 1}
        ry={r - 1}
        fill="none"
        className="stroke-zinc-300 dark:stroke-zinc-600"
        strokeWidth={1.5}
      />
      {DOTS[value].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={(cx * size) / 100}
          cy={(cy * size) / 100}
          r={size * 0.09}
          className="fill-zinc-900 dark:fill-zinc-100"
        />
      ))}
    </svg>
  );
}

const SPEEDS = [
  { label: "slow", delay: 500 },
  { label: "medium", delay: 100 },
  { label: "fast", delay: 0 },
];

function rollOne(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function DiceSimulator() {
  const [numDice, setNumDice] = useState<1 | 2 | 3>(1);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [totalRolls, setTotalRolls] = useState(0);
  const [lastRoll, setLastRoll] = useState<number[] | null>(null);
  const [runCount, setRunCount] = useState(100);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const countsRef = useRef<Record<number, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function doRoll(dice: number): { rolls: number[]; sum: number } {
    const rolls = Array.from({ length: dice }, rollOne);
    const sum = rolls.reduce((a, b) => a + b, 0);
    countsRef.current = {
      ...countsRef.current,
      [sum]: (countsRef.current[sum] ?? 0) + 1,
    };
    return { rolls, sum };
  }

  function singleToss() {
    if (running) return;
    const { rolls } = doRoll(numDice);
    setCounts(countsRef.current);
    setTotalRolls((t) => t + 1);
    setLastRoll(rolls);
  }

  function stopAuto() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
    setTimeout(() => setProgress(0), 400);
  }

  function startAuto() {
    const target = Math.min(Math.max(runCount || 0, 1), 100000);
    doneRef.current = 0;
    setRunning(true);
    setProgress(0);

    const delay = SPEEDS[speedIdx].delay;
    if (delay === 0) {
      let lastRolls: number[] = [];
      for (let i = 0; i < target; i++) {
        lastRolls = doRoll(numDice).rolls;
      }
      setCounts(countsRef.current);
      setTotalRolls((t) => t + target);
      setLastRoll(lastRolls);
      setProgress(100);
      setTimeout(stopAuto, 150);
    } else {
      intervalRef.current = setInterval(() => {
        const { rolls } = doRoll(numDice);
        doneRef.current++;
        setCounts(countsRef.current);
        setTotalRolls((t) => t + 1);
        setLastRoll(rolls);
        setProgress((doneRef.current / target) * 100);
        if (doneRef.current >= target) stopAuto();
      }, delay);
    }
  }

  function reset() {
    stopAuto();
    countsRef.current = {};
    setCounts({});
    setTotalRolls(0);
    setLastRoll(null);
  }

  const min = numDice;
  const max = numDice * 6;
  let sum = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (const [k, v] of Object.entries(counts)) {
    const ki = Number(k);
    sum += ki * v;
    mn = Math.min(mn, ki);
    mx = Math.max(mx, ki);
  }
  const mean = totalRolls ? sum / totalRolls : 0;
  let variance = 0;
  for (const [k, v] of Object.entries(counts)) {
    variance += v * (Number(k) - mean) ** 2;
  }
  const stdDev = totalRolls ? Math.sqrt(variance / totalRolls) : 0;

  const bars = Array.from({ length: max - min + 1 }, (_, i) => {
    const s = min + i;
    return { label: String(s), value: counts[s] ?? 0 };
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dice Simulator
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Roll one or more dice, once or thousands of times, and watch the
        distribution of sums take shape — a hands-on look at the law of large
        numbers.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Number of dice
          </span>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                disabled={running}
                onClick={() => setNumDice(n)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  numDice === n
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Single toss
          </span>
          <button
            onClick={singleToss}
            disabled={running}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Toss once
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Auto-run
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={100000}
              value={runCount}
              disabled={running}
              onChange={(e) => setRunCount(Number(e.target.value))}
              className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              onClick={running ? stopAuto : startAuto}
              className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
                running
                  ? "border-red-800 bg-red-800 text-white hover:bg-red-900"
                  : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {running ? "Stop" : "Run"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Speed: {SPEEDS[speedIdx].label}
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={speedIdx}
            onChange={(e) => setSpeedIdx(Number(e.target.value))}
            className="w-28"
          />
        </div>

        <button
          onClick={reset}
          className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50"
        >
          Reset
        </button>
      </div>

      <div className="mt-6 flex min-h-[80px] items-center gap-3">
        {lastRoll ? (
          <>
            {lastRoll.map((v, i) => (
              <Die key={i} value={v} />
            ))}
            <div className="ml-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-500">Sum</p>
              <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {lastRoll.reduce((a, b) => a + b, 0)}
              </p>
            </div>
          </>
        ) : (
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            Roll the dice to begin
          </span>
        )}
      </div>

      {running && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-50"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {totalRolls > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total rolls" value={totalRolls.toLocaleString()} />
            <Stat label="Mean" value={mean.toFixed(2)} />
            <Stat label="Std dev" value={stdDev.toFixed(2)} />
            <Stat label="Min" value={mn} />
            <Stat label="Max" value={mx} />
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Frequency table
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 dark:text-zinc-500">
                    <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                      Sum
                    </th>
                    <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                      Count
                    </th>
                    <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bars.map((b) => (
                    <tr key={b.label}>
                      <td className="py-1 text-zinc-900 dark:text-zinc-50">
                        {b.label}
                      </td>
                      <td className="py-1 text-zinc-700 dark:text-zinc-300">
                        {b.value.toLocaleString()}
                      </td>
                      <td className="py-1 text-zinc-700 dark:text-zinc-300">
                        {((b.value / totalRolls) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Histogram
              </p>
              <BarChart bars={bars} />
            </div>
          </div>
        </>
      )}
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
