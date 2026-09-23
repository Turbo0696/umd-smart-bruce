"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  type BoxPlotStats,
  type Quantile,
  type RandomShape,
  MIN_BOX_PLOT_N,
  MIN_OUTLIER_N,
  computeBoxPlot,
  generateRandomData,
  parseNumbers,
} from "@/lib/boxPlot";

type Orientation = "horizontal" | "vertical";
type Section = "sort" | "quartiles" | "iqr" | "fences" | "whiskers" | "outliers";

const EXAMPLE = "12, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 31, 48";
const MAX_RANDOM = 1000;

const SHAPES: { value: RandomShape; label: string }[] = [
  { value: "normal", label: "Bell-shaped" },
  { value: "uniform", label: "Uniform" },
  { value: "skewed", label: "Right-skewed" },
];

const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

/** Up to 4 decimals, trailing zeros dropped. */
function fmt(x: number): string {
  const v = parseFloat(x.toFixed(4));
  return Object.is(v, -0) ? "0" : String(v);
}

function segClass(active: boolean, small = false): string {
  return `rounded-md border font-medium ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
      : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
  }`;
}

export function BoxPlotCalculator() {
  const [dataText, setDataText] = useState(EXAMPLE);
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [showPoints, setShowPoints] = useState(true);
  const [showFences, setShowFences] = useState(true);
  const [showMean, setShowMean] = useState(true);
  const [genCount, setGenCount] = useState("30");
  const [genShape, setGenShape] = useState<RandomShape>("normal");
  const [genOutliers, setGenOutliers] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const { values, invalid } = parseNumbers(dataText);
  const stats = computeBoxPlot(values);

  const count = Math.floor(Number(genCount));
  const countValid = Number.isFinite(count) && count >= MIN_BOX_PLOT_N && count <= MAX_RANDOM;

  function generate() {
    if (!countValid) return;
    setDataText(generateRandomData(count, genShape, genOutliers).join(", "));
  }

  function explain(section: Section = "sort") {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() =>
      dialog.querySelector(`#bp-${section}`)?.scrollIntoView({ block: "start" }),
    );
  }

  const inputClass =
    "rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Box Plot Calculator
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Enter a data set, or generate random practice data, to see its
        quartiles, fences, whiskers, and outliers as a box plot.
      </p>

      {/* Data entry + random generator */}
      <div className="mt-6 grid gap-5 rounded-lg border border-zinc-200 p-5 md:grid-cols-[1fr_auto] dark:border-zinc-800">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">
            Data — separate values with commas, spaces, or new lines
          </span>
          <textarea
            value={dataText}
            onChange={(e) => setDataText(e.target.value)}
            rows={5}
            spellCheck={false}
            className={`${inputClass} font-mono text-sm`}
          />
          <span className="text-xs text-zinc-500">
            {values.length} value{values.length === 1 ? "" : "s"}
            {invalid.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                {" "}· ignored: {invalid.slice(0, 5).join(", ")}
                {invalid.length > 5 ? "…" : ""}
              </span>
            )}
          </span>
        </label>

        <div className="flex flex-col gap-3 rounded-md bg-zinc-50 p-4 md:w-64 dark:bg-zinc-900">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Random number generator
          </span>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">
              How many numbers ({MIN_BOX_PLOT_N}–{MAX_RANDOM})
            </span>
            <input
              type="number"
              min={MIN_BOX_PLOT_N}
              max={MAX_RANDOM}
              step={1}
              value={genCount}
              onChange={(e) => setGenCount(e.target.value)}
              className={`${inputClass} font-mono tabular-nums`}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Shape</span>
            <div className="flex flex-wrap gap-1.5">
              {SHAPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={genShape === value}
                  onClick={() => setGenShape(value)}
                  className={segClass(genShape === value, true)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={genOutliers}
              onChange={(e) => setGenOutliers(e.target.checked)}
            />
            Include a few outliers
          </label>
          {genOutliers && countValid && count < MIN_OUTLIER_N && (
            <span className="text-xs text-zinc-500">
              Needs at least {MIN_OUTLIER_N} numbers — with fewer, an extreme
              value drags the quartiles and fences along with it.
            </span>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={!countValid}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Generate
          </button>
        </div>
      </div>

      {/* Display options */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1.5">
          {ORIENTATIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={orientation === value}
              onClick={() => setOrientation(value)}
              className={segClass(orientation === value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Toggle checked={showPoints} onChange={setShowPoints} label="Data points" />
        <Toggle checked={showFences} onChange={setShowFences} label="Fences" />
        <Toggle checked={showMean} onChange={setShowMean} label="Mean" />
        <button
          type="button"
          onClick={() => explain()}
          disabled={!stats}
          className="ml-auto rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
        >
          How is this calculated?
        </button>
      </div>

      {stats ? (
        <>
          <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <BoxPlotChart
              stats={stats}
              orientation={orientation}
              showPoints={showPoints}
              showFences={showFences}
              showMean={showMean}
              onExplain={explain}
            />
            <Legend showPoints={showPoints} showFences={showFences} showMean={showMean} />
            <p className="mt-2 text-center text-xs text-zinc-500">
              Click any part of the plot to see how it&apos;s calculated.
            </p>
          </div>
          <StatsTable stats={stats} onExplain={explain} />
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Enter at least {MIN_BOX_PLOT_N} numbers to draw a box plot.
        </p>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // A click on the dialog element itself (not its contents) is a
          // click on the backdrop.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {stats && <Explanation stats={stats} onClose={() => dialogRef.current?.close()} />}
      </dialog>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Chart

/** Round step (1, 2, or 5 × 10^k) giving about `target` ticks over the range. */
function niceTicks(lo: number, hi: number, target = 6) {
  const raw = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(parseFloat(t.toFixed(10)));
  return { ticks, lo: start, hi: end };
}

/** Deterministic 0–1 jitter per index, so points don't jump on re-render. */
function jitter(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Label = { key: string; name: string; value: string; target: number; size: number; pos: number };

/** Spread labels along one axis so none overlap, keeping each near its target. */
function spreadLabels(labels: Label[], min: number, max: number): Label[] {
  const out = [...labels].sort((a, b) => a.target - b.target).map((l) => ({ ...l, pos: l.target }));
  for (let i = 0; i < out.length; i++) {
    const lowest = i === 0 ? min + out[i].size / 2 : out[i - 1].pos + (out[i - 1].size + out[i].size) / 2;
    out[i].pos = Math.max(out[i].pos, lowest);
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const highest =
      i === out.length - 1 ? max - out[i].size / 2 : out[i + 1].pos - (out[i + 1].size + out[i].size) / 2;
    out[i].pos = Math.min(out[i].pos, highest);
  }
  return out;
}

function BoxPlotChart({
  stats,
  orientation,
  showPoints,
  showFences,
  showMean,
  onExplain,
}: {
  stats: BoxPlotStats;
  orientation: Orientation;
  showPoints: boolean;
  showFences: boolean;
  showMean: boolean;
  onExplain: (s: Section) => void;
}) {
  const horizontal = orientation === "horizontal";

  // Value range: the data, plus the fences when they're drawn.
  let lo = stats.min;
  let hi = stats.max;
  if (showFences) {
    lo = Math.min(lo, stats.lowerFence);
    hi = Math.max(hi, stats.upperFence);
  }
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  const axis = niceTicks(lo - pad, hi + pad);

  // Geometry. "Along" = the value axis; "cross" = perpendicular to it.
  const W = horizontal ? 720 : 520;
  const H = horizontal ? (showPoints ? 270 : 220) : 560;
  const alongStart = horizontal ? 56 : H - 40; // pixel for axis.lo
  const alongEnd = horizontal ? W - 32 : 28; // pixel for axis.hi
  const A = (v: number) => alongStart + ((v - axis.lo) / (axis.hi - axis.lo)) * (alongEnd - alongStart);

  const boxHalf = horizontal ? 30 : 42;
  const boxC = horizontal ? 100 : showPoints ? 250 : 180;
  const boxLo = boxC - boxHalf;
  const boxHi = boxC + boxHalf;
  const capHalf = boxHalf * 0.55;
  const pointsC = horizontal ? 172 : 128;
  const pointsHalf = horizontal ? 16 : 26;
  const axisCross = horizontal ? H - 40 : 64;
  const gridFrom = horizontal ? 56 : axisCross;
  const gridTo = horizontal ? axisCross : W - 16;

  const xy = (v: number, c: number) => (horizontal ? { x: A(v), y: c } : { x: c, y: A(v) });
  const seg = (v1: number, c1: number, v2: number, c2: number) => {
    const p = xy(v1, c1);
    const q = xy(v2, c2);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  };
  const rect = (vLo: number, vHi: number, cLo: number, cHi: number) =>
    horizontal
      ? { x: A(vLo), y: cLo, width: A(vHi) - A(vLo), height: cHi - cLo }
      : { x: cLo, y: A(vHi), width: cHi - cLo, height: A(vLo) - A(vHi) };

  const q1 = stats.q1.value;
  const q3 = stats.q3.value;
  const outlierSet = new Set(stats.outliers);

  // Value labels, spread apart so they never overlap.
  const labelDefs: [string, string, number][] = [
    ["wlo", "Whisker", stats.whiskerLow],
    ["q1", "Q1", q1],
    ["med", "Median", stats.median],
    ["q3", "Q3", q3],
    ["whi", "Whisker", stats.whiskerHigh],
  ];
  if (showFences) {
    labelDefs.push(["lf", "Lower fence", stats.lowerFence], ["uf", "Upper fence", stats.upperFence]);
  }
  const labels = spreadLabels(
    labelDefs.map(([key, name, v]) => ({
      key,
      name,
      value: fmt(v),
      target: A(v),
      pos: 0,
      size: horizontal ? Math.max(name.length * 6.2, fmt(v).length * 7.6) + 12 : 19,
    })),
    horizontal ? 8 : 12,
    horizontal ? W - 8 : H - 12,
  );
  const labelLane = horizontal ? 0 : boxHi + 46; // vertical: x where labels start

  const clickable = "cursor-pointer transition-opacity hover:opacity-70";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`mx-auto h-auto w-full ${horizontal ? "" : "max-w-xl"}`}
      role="img"
      aria-label={`Box plot: Q1 ${fmt(q1)}, median ${fmt(stats.median)}, Q3 ${fmt(q3)}, whiskers ${fmt(stats.whiskerLow)} to ${fmt(stats.whiskerHigh)}, ${stats.outliers.length} outlier(s)`}
    >
      {/* Grid + axis */}
      {axis.ticks.map((t) => {
        const g = horizontal
          ? { x1: A(t), y1: gridFrom, x2: A(t), y2: gridTo }
          : { x1: gridFrom, y1: A(t), x2: gridTo, y2: A(t) };
        return (
          <g key={t}>
            <line {...g} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray="3,4" />
            <text
              x={horizontal ? A(t) : axisCross - 8}
              y={horizontal ? axisCross + 18 : A(t) + 4}
              textAnchor={horizontal ? "middle" : "end"}
              fontSize={horizontal ? 11 : 12}
              className="fill-zinc-500 font-mono"
            >
              {fmt(t)}
            </text>
          </g>
        );
      })}
      <line
        {...(horizontal
          ? { x1: A(axis.lo), y1: axisCross, x2: A(axis.hi), y2: axisCross }
          : { x1: axisCross, y1: A(axis.lo), x2: axisCross, y2: A(axis.hi) })}
        className="stroke-zinc-400 dark:stroke-zinc-600"
      />

      {/* Fences */}
      {showFences &&
        [stats.lowerFence, stats.upperFence].map((f, i) => (
          <line
            key={i}
            {...seg(f, boxLo - 14, f, boxHi + 14)}
            strokeDasharray="5,4"
            strokeWidth={1.5}
            className={`stroke-rose-400 dark:stroke-rose-500 ${clickable}`}
            onClick={() => onExplain("fences")}
          >
            <title>{`${i === 0 ? "Lower" : "Upper"} fence: ${fmt(f)}`}</title>
          </line>
        ))}

      {/* Data points strip */}
      {showPoints &&
        stats.sorted.map((v, i) => {
          const p = xy(v, pointsC + (jitter(i) * 2 - 1) * pointsHalf);
          const out = outlierSet.has(v);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              className={
                out
                  ? "fill-rose-500/80 dark:fill-rose-400/80"
                  : "fill-blue-500/45 dark:fill-blue-400/50"
              }
            >
              <title>{fmt(v)}</title>
            </circle>
          );
        })}

      {/* Whiskers */}
      <g className={clickable} onClick={() => onExplain("whiskers")}>
        {[
          [stats.whiskerLow, q1],
          [q3, stats.whiskerHigh],
        ].map(([a, b], i) => (
          <g key={i}>
            <line {...seg(a, boxC, b, boxC)} strokeWidth={2} className="stroke-zinc-500 dark:stroke-zinc-400" />
            <line
              {...seg(i === 0 ? a : b, boxC - capHalf, i === 0 ? a : b, boxC + capHalf)}
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-zinc-500 dark:stroke-zinc-400"
            />
            {/* Wider invisible hit area */}
            <line {...seg(a, boxC, b, boxC)} strokeWidth={14} stroke="transparent" />
          </g>
        ))}
        <title>{`Whiskers: ${fmt(stats.whiskerLow)} to ${fmt(stats.whiskerHigh)}`}</title>
      </g>

      {/* Box + median */}
      <g className={clickable} onClick={() => onExplain("quartiles")}>
        <rect
          {...rect(q1, q3, boxLo, boxHi)}
          rx={5}
          strokeWidth={2}
          className="fill-blue-100 stroke-blue-600 dark:fill-blue-950 dark:stroke-blue-400"
        />
        <line
          {...seg(stats.median, boxLo, stats.median, boxHi)}
          strokeWidth={3.5}
          className="stroke-blue-700 dark:stroke-blue-300"
        />
        <title>{`Q1 ${fmt(q1)} · Median ${fmt(stats.median)} · Q3 ${fmt(q3)} · IQR ${fmt(stats.iqr)}`}</title>
      </g>

      {/* Mean */}
      {showMean &&
        (() => {
          const p = xy(stats.mean, boxC);
          return (
            <path
              d={`M${p.x},${p.y - 7} L${p.x + 7},${p.y} L${p.x},${p.y + 7} L${p.x - 7},${p.y} Z`}
              strokeWidth={1.5}
              className="fill-amber-400 stroke-white dark:stroke-zinc-900"
            >
              <title>{`Mean: ${fmt(stats.mean)}`}</title>
            </path>
          );
        })()}

      {/* Outliers */}
      <g className={clickable} onClick={() => onExplain("outliers")}>
        {stats.outliers.map((v, i) => {
          const p = xy(v, boxC);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={5.5}
              strokeWidth={2}
              className="fill-white stroke-rose-500 dark:fill-zinc-900 dark:stroke-rose-400"
            >
              <title>{`Outlier: ${fmt(v)}`}</title>
            </circle>
          );
        })}
      </g>

      {/* Value labels with leader lines */}
      {labels.map((l) => {
        const fence = l.key === "lf" || l.key === "uf";
        const tone = fence ? "fill-rose-600 dark:fill-rose-400" : "fill-zinc-500";
        if (horizontal) {
          return (
            <g key={l.key}>
              <line
                x1={l.pos}
                y1={45}
                x2={l.target}
                y2={boxLo - (fence ? 16 : 3)}
                className="stroke-zinc-300 dark:stroke-zinc-700"
              />
              <text x={l.pos} y={20} textAnchor="middle" fontSize={10.5} className={tone}>
                {l.name}
              </text>
              <text
                x={l.pos}
                y={37}
                textAnchor="middle"
                fontSize={12.5}
                fontWeight={600}
                className="fill-zinc-900 font-mono dark:fill-zinc-50"
              >
                {l.value}
              </text>
            </g>
          );
        }
        return (
          <g key={l.key}>
            <line
              x1={boxHi + (fence ? 16 : 3)}
              y1={l.target}
              x2={labelLane - 5}
              y2={l.pos}
              className="stroke-zinc-300 dark:stroke-zinc-700"
            />
            <text x={labelLane} y={l.pos + 4.5} fontSize={13}>
              <tspan className={tone}>{l.name} </tspan>
              <tspan fontWeight={600} className="fill-zinc-900 font-mono dark:fill-zinc-50">
                {l.value}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({
  showPoints,
  showFences,
  showMean,
}: {
  showPoints: boolean;
  showFences: boolean;
  showMean: boolean;
}) {
  const item = "flex items-center gap-1.5";
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
      <span className={item}>
        <span className="inline-block h-3 w-5 rounded-sm border-2 border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-950" />
        Box: Q1 to Q3 (middle 50%)
      </span>
      <span className={item}>
        <span className="inline-block h-3.5 w-1 rounded bg-blue-700 dark:bg-blue-300" />
        Median
      </span>
      <span className={item}>
        <span className="inline-block h-0.5 w-5 bg-zinc-500 dark:bg-zinc-400" />
        Whiskers
      </span>
      <span className={item}>
        <span className="inline-block h-3 w-3 rounded-full border-2 border-rose-500 dark:border-rose-400" />
        Outliers
      </span>
      {showFences && (
        <span className={item}>
          <span className="inline-block w-5 border-t-2 border-dashed border-rose-400 dark:border-rose-500" />
          Fences (outlier cutoffs)
        </span>
      )}
      {showMean && (
        <span className={item}>
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-amber-400" />
          Mean
        </span>
      )}
      {showPoints && (
        <span className={item}>
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500/50" />
          Data points
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary table

function StatsTable({ stats, onExplain }: { stats: BoxPlotStats; onExplain: (s: Section) => void }) {
  const rows: [string, string, Section][] = [
    ["Count (n)", String(stats.n), "sort"],
    ["Minimum", fmt(stats.min), "sort"],
    ["Q1", fmt(stats.q1.value), "quartiles"],
    ["Median", fmt(stats.median), "quartiles"],
    ["Q3", fmt(stats.q3.value), "quartiles"],
    ["Maximum", fmt(stats.max), "sort"],
    ["Mean", fmt(stats.mean), "sort"],
    ["IQR", fmt(stats.iqr), "iqr"],
    ["Lower fence", fmt(stats.lowerFence), "fences"],
    ["Upper fence", fmt(stats.upperFence), "fences"],
    ["Lower whisker", fmt(stats.whiskerLow), "whiskers"],
    ["Upper whisker", fmt(stats.whiskerHigh), "whiskers"],
  ];
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map(([label, value, section]) => (
          <button
            key={label}
            type="button"
            onClick={() => onExplain(section)}
            className="rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <span className="flex items-center justify-between text-xs text-zinc-500">
              {label}
              <span aria-hidden="true" className="text-blue-600 dark:text-blue-400">ⓘ</span>
            </span>
            <span className="block font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {value}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onExplain("outliers")}
        className="mt-3 w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
      >
        <span className="flex items-center justify-between text-xs text-zinc-500">
          Outliers ({stats.outliers.length})
          <span aria-hidden="true" className="text-blue-600 dark:text-blue-400">ⓘ</span>
        </span>
        <span className="block font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
          {stats.outliers.length ? stats.outliers.map(fmt).join(", ") : "None"}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worked explanation (popup)

function Step({
  id,
  n,
  title,
  children,
}: {
  id: Section;
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={`bp-${id}`} className="scroll-mt-4 border-t border-zinc-200 pt-5 first:border-t-0 first:pt-0 dark:border-zinc-800">
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white dark:bg-blue-500">
          {n}
        </span>
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-zinc-50 px-3 py-2 font-mono text-[13px] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
      {children}
    </p>
  );
}

function ordinal(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  return `${k}${["th", "st", "nd", "rd"][k % 10] ?? "th"}`;
}

function QuantileWork({ name, p, q, n }: { name: string; p: string; q: Quantile; n: number }) {
  const whole = Number.isInteger(q.position);
  const lo = Math.floor(q.position);
  const frac = parseFloat((q.position - lo).toFixed(4));
  return (
    <Formula>
      {name}: position = {p} × ({n} + 1) = {fmt(q.position)}
      <br />
      {whole ? (
        <>
          → the {ordinal(q.position)} value, so {name} = {fmt(q.value)}
        </>
      ) : (
        <>
          → {frac} of the way from the {ordinal(lo)} value ({fmt(q.below)}) to the {ordinal(lo + 1)} ({fmt(q.above)})
          <br />
          {name} = {fmt(q.below)} + {frac} × ({fmt(q.above)} − {fmt(q.below)}) = {fmt(q.value)}
        </>
      )}
    </Formula>
  );
}

function Explanation({ stats, onClose }: { stats: BoxPlotStats; onClose: () => void }) {
  const { n } = stats;
  const q1 = stats.q1.value;
  const q3 = stats.q3.value;
  const outliers = new Set(stats.outliers);
  return (
    <div className="flex max-h-[85vh] flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">How the box plot is calculated</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          ×
        </button>
      </div>
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <Step id="sort" n={1} title="Sort the data">
          <p>
            Put all {n} values in order from smallest to largest. The small
            number above each value is its position. The minimum is{" "}
            <b>{fmt(stats.min)}</b>, the maximum is <b>{fmt(stats.max)}</b>, and
            the mean (sum ÷ n) is <b>{fmt(stats.mean)}</b>.
          </p>
          <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
            {stats.sorted.map((v, i) => (
              <span
                key={i}
                className={`flex flex-col items-center rounded px-1.5 py-0.5 font-mono text-xs ${
                  outliers.has(v)
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                }`}
              >
                <span className="text-[9px] text-zinc-400">{i + 1}</span>
                {fmt(v)}
              </span>
            ))}
          </div>
        </Step>

        <Step id="quartiles" n={2} title="Find the quartiles (exclusive method)">
          <p>
            The quartiles split the sorted data into four equal parts. With
            the <b>exclusive</b> method, the p-th quartile sits at position{" "}
            <b>p × (n + 1)</b>. When that position falls between two values,
            go the fractional part of the way from one to the next.
          </p>
          <QuantileWork name="Q1" p="0.25" q={stats.q1} n={n} />
          <QuantileWork name="Median" p="0.5" q={stats.medianPos} n={n} />
          <QuantileWork name="Q3" p="0.75" q={stats.q3} n={n} />
          <p className="text-xs text-zinc-500">
            This matches Excel&apos;s <code>QUARTILE.EXC</code>. The inclusive
            method (<code>QUARTILE.INC</code>) uses position p × (n − 1) + 1
            and can give slightly different Q1 and Q3. The box is drawn from
            Q1 to Q3, with a line at the median.
          </p>
        </Step>

        <Step id="iqr" n={3} title="Interquartile range (IQR)">
          <p>The IQR is the width of the box: the spread of the middle 50% of the data.</p>
          <Formula>
            IQR = Q3 − Q1 = {fmt(q3)} − {fmt(q1)} = {fmt(stats.iqr)}
          </Formula>
        </Step>

        <Step id="fences" n={4} title="Lower and upper fences (limits)">
          <p>
            The fences are the cutoffs for unusual values: 1.5 IQRs beyond each
            end of the box. They aren&apos;t part of a standard box plot, which
            is why they&apos;re drawn dashed here.
          </p>
          <Formula>
            Lower fence = Q1 − 1.5 × IQR = {fmt(q1)} − 1.5 × {fmt(stats.iqr)} ={" "}
            {fmt(stats.lowerFence)}
            <br />
            Upper fence = Q3 + 1.5 × IQR = {fmt(q3)} + 1.5 × {fmt(stats.iqr)} ={" "}
            {fmt(stats.upperFence)}
          </Formula>
        </Step>

        <Step id="whiskers" n={5} title="Whiskers">
          <p>
            Each whisker runs from the box out to the <b>most extreme data
            value that is still inside the fences</b> — not to the fence itself.
          </p>
          <Formula>
            Lower whisker = smallest value ≥ {fmt(stats.lowerFence)} → {fmt(stats.whiskerLow)}
            <br />
            Upper whisker = largest value ≤ {fmt(stats.upperFence)} → {fmt(stats.whiskerHigh)}
          </Formula>
          <p>
            {stats.outliers.length === 0
              ? "There are no outliers, so the whiskers reach all the way to the minimum and maximum."
              : "Values beyond the fences are left off the whiskers and plotted individually as outliers."}
          </p>
        </Step>

        <Step id="outliers" n={6} title="Outliers">
          <p>
            Any value <b>below the lower fence</b> or <b>above the upper
            fence</b> is an outlier and is drawn as its own circle.
          </p>
          <Formula>
            value &lt; {fmt(stats.lowerFence)} or value &gt; {fmt(stats.upperFence)}
            <br />→{" "}
            {stats.outliers.length
              ? `${stats.outliers.length} outlier${stats.outliers.length === 1 ? "" : "s"}: ${stats.outliers.map(fmt).join(", ")}`
              : "none"}
          </Formula>
        </Step>
      </div>
    </div>
  );
}
