"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart } from "@/components/BarChart";

const MIN_BABIES = 2;
const MAX_BABIES = 8;
const DEFAULT_BABIES = 4;

const SPEEDS = [
  { label: "slow", delay: 500 },
  { label: "medium", delay: 100 },
  { label: "fast", delay: 0 },
];

// Fisher-Yates shuffle of [0, 1, ..., n-1] — perm[i] is the mother that
// baby i was (randomly) handed back to. A "match" is perm[i] === i.
function randomAssignment(n: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

function countMatches(perm: number[]): number {
  return perm.reduce((acc, mother, baby) => acc + (mother === baby ? 1 : 0), 0);
}

const MATCH_STROKE = "stroke-emerald-500 dark:stroke-emerald-400";
const MISS_STROKE = "stroke-zinc-300 dark:stroke-zinc-700";
const MATCH_FILL = "fill-emerald-100 dark:fill-emerald-950";
const MISS_FILL = "fill-zinc-100 dark:fill-zinc-800";
const FACE_STROKE = "stroke-zinc-600 dark:stroke-zinc-300";

// Mother icon: a wider oval with a little hair arc on top, distinct from
// the plain round baby icon below it.
function MotherIcon({ x, y, matched, label }: { x: number; y: number; matched: boolean; label: number }) {
  const r = 20;
  return (
    <g>
      <text
        x={x}
        y={y - r - 10}
        textAnchor="middle"
        className="fill-zinc-500 dark:fill-zinc-500"
        fontSize={11}
      >
        Mother {label}
      </text>
      <path
        d={`M ${x - r} ${y - 4} A ${r} ${r * 0.9} 0 0 1 ${x + r} ${y - 4}`}
        className={matched ? MATCH_STROKE : "stroke-zinc-400 dark:stroke-zinc-600"}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx={x}
        cy={y}
        r={r}
        className={matched ? `${MATCH_FILL} ${MATCH_STROKE}` : `${MISS_FILL} stroke-zinc-300 dark:stroke-zinc-600`}
        strokeWidth={2}
      />
      <circle cx={x - 6} cy={y - 1} r={1.8} className={`fill-current ${FACE_STROKE}`} />
      <circle cx={x + 6} cy={y - 1} r={1.8} className={`fill-current ${FACE_STROKE}`} />
      <path
        d={`M ${x - 6} ${y + 7} Q ${x} ${y + 11} ${x + 6} ${y + 7}`}
        fill="none"
        className={FACE_STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {matched && (
        <circle cx={x + r - 4} cy={y - r + 4} r={7} className="fill-emerald-500 dark:fill-emerald-400" />
      )}
      {matched && (
        <path
          d={`M ${x + r - 7.5} ${y - r + 4} l 2 2 l 3.5 -4`}
          fill="none"
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

// Baby icon: a smaller plain circle with a single curl of hair, seated
// below its mother slot and joined to wherever it actually landed.
function BabyIcon({ x, y, matched, label }: { x: number; y: number; matched: boolean; label: number }) {
  const r = 15;
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={r}
        className={matched ? `${MATCH_FILL} ${MATCH_STROKE}` : `${MISS_FILL} stroke-zinc-300 dark:stroke-zinc-600`}
        strokeWidth={2}
      />
      <path
        d={`M ${x - 2} ${y - r} q 4 -6 6 0`}
        fill="none"
        className={FACE_STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={x - 4.5} cy={y - 1} r={1.4} className={`fill-current ${FACE_STROKE}`} />
      <circle cx={x + 4.5} cy={y - 1} r={1.4} className={`fill-current ${FACE_STROKE}`} />
      <circle cx={x} cy={y + 5} r={1.6} className={`fill-current ${FACE_STROKE}`} />
      <text
        x={x}
        y={y + r + 14}
        textAnchor="middle"
        className="fill-zinc-500 dark:fill-zinc-500"
        fontSize={11}
      >
        Baby {label}
      </text>
    </g>
  );
}

function AssignmentDiagram({ perm }: { perm: number[] }) {
  const n = perm.length;
  const slotWidth = 84;
  const width = Math.max(320, n * slotWidth);
  const height = 190;
  const topY = 40;
  const bottomY = height - 40;
  const spacing = width / (n + 1);
  const xFor = (i: number) => spacing * (i + 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[320px]" role="img">
        {perm.map((mother, baby) => {
          const matched = mother === baby;
          return (
            <line
              key={baby}
              x1={xFor(baby)}
              y1={bottomY - 15}
              x2={xFor(mother)}
              y2={topY + 20}
              className={matched ? MATCH_STROKE : MISS_STROKE}
              strokeWidth={matched ? 2.5 : 1.5}
            />
          );
        })}
        {perm.map((_, i) => (
          <MotherIcon key={`m${i}`} x={xFor(i)} y={topY} matched={perm[i] === i} label={i + 1} />
        ))}
        {perm.map((mother, baby) => (
          <BabyIcon key={`b${baby}`} x={xFor(baby)} y={bottomY} matched={mother === baby} label={baby + 1} />
        ))}
      </svg>
    </div>
  );
}

export function RandomBabiesSimulator() {
  const [numBabies, setNumBabies] = useState(DEFAULT_BABIES);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [totalTrials, setTotalTrials] = useState(0);
  const [lastAssignment, setLastAssignment] = useState<number[] | null>(null);
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

  function doTrial(n: number): { perm: number[]; matches: number } {
    const perm = randomAssignment(n);
    const matches = countMatches(perm);
    countsRef.current = {
      ...countsRef.current,
      [matches]: (countsRef.current[matches] ?? 0) + 1,
    };
    return { perm, matches };
  }

  function singleTrial() {
    if (running) return;
    const { perm } = doTrial(numBabies);
    setCounts(countsRef.current);
    setTotalTrials((t) => t + 1);
    setLastAssignment(perm);
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
      let lastPerm: number[] = [];
      for (let i = 0; i < target; i++) {
        lastPerm = doTrial(numBabies).perm;
      }
      setCounts(countsRef.current);
      setTotalTrials((t) => t + target);
      setLastAssignment(lastPerm);
      setProgress(100);
      setTimeout(stopAuto, 150);
    } else {
      intervalRef.current = setInterval(() => {
        const { perm } = doTrial(numBabies);
        doneRef.current++;
        setCounts(countsRef.current);
        setTotalTrials((t) => t + 1);
        setLastAssignment(perm);
        setProgress((doneRef.current / target) * 100);
        if (doneRef.current >= target) stopAuto();
      }, delay);
    }
  }

  function reset() {
    stopAuto();
    countsRef.current = {};
    setCounts({});
    setTotalTrials(0);
    setLastAssignment(null);
  }

  function changeNumBabies(n: number) {
    if (running) return;
    setNumBabies(n);
    // A count of "3 matches out of 4 babies" isn't comparable to one out
    // of 6 babies, so the tally only makes sense for a single N at a time.
    reset();
  }

  let weightedSum = 0;
  for (const [k, v] of Object.entries(counts)) {
    weightedSum += Number(k) * v;
  }
  const mean = totalTrials ? weightedSum / totalTrials : 0;
  let variance = 0;
  for (const [k, v] of Object.entries(counts)) {
    variance += v * (Number(k) - mean) ** 2;
  }
  const stdDev = totalTrials ? Math.sqrt(variance / totalTrials) : 0;

  const bars = Array.from({ length: numBabies + 1 }, (_, matches) => ({
    label: String(matches),
    value: counts[matches] ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Random Babies
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        A hospital nursery mixes up its babies and hands each one back to a
        random mother. How many babies end up with their own mother by pure
        chance? Run the shuffle once, or thousands of times, and watch the
        distribution of correct matches take shape.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Number of babies
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(
              { length: MAX_BABIES - MIN_BABIES + 1 },
              (_, i) => MIN_BABIES + i,
            ).map((n) => (
              <button
                key={n}
                disabled={running}
                onClick={() => changeNumBabies(n)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  numBabies === n
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
            Single shuffle
          </span>
          <button
            onClick={singleTrial}
            disabled={running}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Shuffle once
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

      <div className="mt-6 min-h-[190px] rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
        {lastAssignment ? (
          <>
            <AssignmentDiagram perm={lastAssignment} />
            <p className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
              {countMatches(lastAssignment)} of {numBabies} babies went home
              with their own mother that time — green lines mark a match.
            </p>
          </>
        ) : (
          <div className="flex h-[190px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-500">
            Shuffle the babies to begin
          </div>
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

      {totalTrials > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total trials" value={totalTrials.toLocaleString()} />
            <Stat label="Mean matches" value={mean.toFixed(2)} />
            <Stat label="Std dev" value={stdDev.toFixed(2)} />
            <Stat label="Theoretical mean" value="1.00" />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            Surprising fact: no matter how many babies are in the nursery,
            the expected number of correct matches is always exactly 1.
          </p>

          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Frequency table
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 dark:text-zinc-500">
                    <th className="border-b border-zinc-200 pb-1 text-left font-normal dark:border-zinc-700">
                      Matches
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
                        {((b.value / totalTrials) * 100).toFixed(1)}%
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
