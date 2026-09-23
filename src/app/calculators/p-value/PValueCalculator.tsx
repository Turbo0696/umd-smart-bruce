"use client";

import { useState } from "react";
import { type Tail, tPValues, tPdf } from "@/lib/tDistribution";

const TAILS: { value: Tail; label: string }[] = [
  { value: "left", label: "Left-tailed" },
  { value: "two", label: "Two-tailed" },
  { value: "right", label: "Right-tailed" },
];

const ALPHAS = [0.1, 0.05, 0.01];

function fmtP(p: number): string {
  return p < 0.0001 ? p.toExponential(2) : p.toFixed(4);
}

function segClass(active: boolean): string {
  return `rounded-md border px-3 py-1.5 text-sm font-medium ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
      : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
  }`;
}

export function PValueCalculator() {
  const [tInput, setTInput] = useState("2.086");
  const [dfInput, setDfInput] = useState("20");
  const [tail, setTail] = useState<Tail>("two");
  const [alpha, setAlpha] = useState<number | null>(null);

  const t = parseFloat(tInput);
  const df = parseFloat(dfInput);
  const valid = Number.isFinite(t) && Number.isFinite(df) && df > 0;
  const p = valid ? tPValues(t, df) : null;
  const shown = p ? p[tail] : null;
  const tailLabel = TAILS.find((x) => x.value === tail)!.label;

  const inputClass =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-lg tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        p-Value Calculator
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Enter a t-statistic and degrees of freedom for an exact p-value from
        Student&apos;s t-distribution.
      </p>

      <div className="mt-6 flex flex-col gap-5 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">t-statistic</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={tInput}
              onChange={(e) => setTInput(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Degrees of freedom</span>
            <input
              type="number"
              step="any"
              min="0.0001"
              inputMode="decimal"
              value={dfInput}
              onChange={(e) => setDfInput(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Test type</span>
          <div className="flex flex-wrap gap-1.5">
            {TAILS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={tail === value}
                onClick={() => setTail(value)}
                className={segClass(tail === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div>
          <p className="text-xs text-zinc-500">{tailLabel} p-value</p>
          <p className="font-mono text-4xl font-semibold tabular-nums text-zinc-900 sm:text-5xl dark:text-zinc-50">
            {shown === null ? "—" : fmtP(shown)}
          </p>
        </div>

        {valid && (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <TCurve t={t} df={df} tail={tail} />
            <p className="mt-1 text-center text-xs text-zinc-500">
              t-distribution, df = {df} — shaded area = {tailLabel.toLowerCase()} p-value
            </p>
          </div>
        )}

        {p && (
          <dl className="grid grid-cols-2 gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-4 dark:border-zinc-800">
            <Stat label="t" value={String(Math.round(t * 1000) / 1000)} />
            <Stat label="df" value={String(df)} />
            <Stat label="P(T ≤ t)" value={fmtP(p.left)} />
            <Stat label="P(T ≥ t)" value={fmtP(p.right)} />
          </dl>
        )}

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">Check significance at α</span>
          <div className="flex flex-wrap gap-1.5">
            {ALPHAS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={alpha === a}
                onClick={() => setAlpha(alpha === a ? null : a)}
                className={`${segClass(alpha === a)} tabular-nums`}
              >
                {a.toFixed(2)}
              </button>
            ))}
          </div>
          {alpha !== null && shown !== null && (
            <p
              className={`rounded-md px-3 py-2 text-sm font-medium tabular-nums ${
                shown < alpha
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              p = {fmtP(shown)} {shown < alpha ? "<" : "≥"} α = {alpha} —{" "}
              {shown < alpha ? "statistically significant" : "not significant"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </dd>
    </div>
  );
}

function TCurve({ t, df, tail }: { t: number; df: number; tail: Tail }) {
  const W = 600;
  const H = 220;
  const padX = 28;
  const padT = 14;
  const baseline = H - 26;
  const domain = Math.max(4.2, Math.abs(t) * 1.2 + 1.2);
  const maxY = tPdf(0, df);
  const n = 140;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = -domain + (2 * domain * i) / n;
    return [x, tPdf(x, df)] as const;
  });
  const px = (x: number) => padX + ((x + domain) / (2 * domain)) * (W - 2 * padX);
  const py = (y: number) => baseline - (y / maxY) * (baseline - padT);

  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(y).toFixed(2)}`)
    .join(" ");

  // Filled region under the curve between a and b, with exact endpoints so
  // the shading meets the t marker line even between sample points.
  function shade(a: number, b: number): string | null {
    if (a >= b) return null;
    const inner = pts.filter(([x]) => x > a && x < b);
    const edge = [[a, tPdf(a, df)] as const, ...inner, [b, tPdf(b, df)] as const];
    return (
      `M${px(a).toFixed(2)},${baseline} ` +
      edge.map(([x, y]) => `L${px(x).toFixed(2)},${py(y).toFixed(2)}`).join(" ") +
      ` L${px(b).toFixed(2)},${baseline} Z`
    );
  }

  const tAbs = Math.abs(t);
  const regions =
    tail === "two"
      ? [shade(tAbs, domain), shade(-domain, -tAbs)]
      : tail === "right"
        ? [shade(t, domain)]
        : [shade(-domain, t)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="t-distribution curve with the p-value tail region shaded"
    >
      <line x1={padX} y1={baseline} x2={W - padX} y2={baseline} className="stroke-zinc-300 dark:stroke-zinc-700" />
      {regions.map(
        (d, i) => d && <path key={i} d={d} className="fill-amber-400/40 dark:fill-amber-400/30" />,
      )}
      <path d={line} fill="none" strokeWidth={2} className="stroke-blue-600 dark:stroke-blue-400" />
      <line
        x1={px(0)}
        y1={padT}
        x2={px(0)}
        y2={baseline}
        strokeDasharray="2,3"
        className="stroke-zinc-300 dark:stroke-zinc-700"
      />
      <line x1={px(t)} y1={padT} x2={px(t)} y2={baseline} strokeWidth={1.5} className="stroke-blue-600 dark:stroke-blue-400" />
      <text x={px(t)} y={baseline + 16} textAnchor="middle" fontSize={12} className="fill-zinc-500 font-mono">
        t={Math.round(t * 1000) / 1000}
      </text>
      <text x={px(0)} y={padT - 2} textAnchor="middle" fontSize={11} className="fill-zinc-500 font-mono">
        0
      </text>
    </svg>
  );
}
