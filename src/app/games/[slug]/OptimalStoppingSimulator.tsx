"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const N_OPTIONS = [2, 3, 5, 10] as const;
type NOption = (typeof N_OPTIONS)[number];
type Source = "dice" | "normal";
type Strategy = "optimal" | "custom";

type Distribution = {
  values: number[];
  probs: number[];
  min: number;
  max: number;
  neverVal: number;
  isDiscrete: boolean;
};

// ---------- distributions ----------

function diceSumDist(d: number): number[] {
  let dist = [1];
  for (let i = 0; i < d; i++) {
    const nd = new Array(dist.length + 6).fill(0);
    for (let s = 0; s < dist.length; s++) {
      if (!dist[s]) continue;
      for (let f = 1; f <= 6; f++) nd[s + f] += dist[s] / 6;
    }
    dist = nd;
  }
  return dist;
}

function normalPDF(x: number, mu: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

function getDistribution(source: Source, D: number, mu: number, sigma: number): Distribution {
  if (source === "dice") {
    const raw = diceSumDist(D);
    const minS = D;
    const maxS = 6 * D;
    const values: number[] = [];
    const probs: number[] = [];
    for (let s = minS; s <= maxS; s++) {
      values.push(s);
      probs.push(raw[s]);
    }
    return { values, probs, min: minS, max: maxS, neverVal: maxS + 1, isDiscrete: true };
  }
  const safeSigma = sigma > 0 ? sigma : 0.1;
  const bins = 800;
  const lo = mu - 5 * safeSigma;
  const hi = mu + 5 * safeSigma;
  const dx = (hi - lo) / bins;
  const values: number[] = [];
  const probs: number[] = [];
  for (let i = 0; i < bins; i++) {
    const x = lo + dx * (i + 0.5);
    values.push(x);
    probs.push(normalPDF(x, mu, safeSigma) * dx);
  }
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < probs.length; i++) probs[i] /= sum;
  return { values, probs, min: lo, max: hi, neverVal: hi, isDiscrete: false };
}

// ---------- core math (backward induction) ----------

function computeEV(dist: Distribution, n: number, th: Record<number, number>): number {
  let ev = 0;
  for (let i = 0; i < dist.values.length; i++) ev += dist.probs[i] * dist.values[i];
  for (let k = n - 1; k >= 1; k--) {
    const t = th[k];
    let stopPart = 0;
    let contProb = 0;
    for (let i = 0; i < dist.values.length; i++) {
      if (dist.values[i] >= t) stopPart += dist.probs[i] * dist.values[i];
      else contProb += dist.probs[i];
    }
    ev = stopPart + contProb * ev;
  }
  return ev;
}

function optimalThresholds(dist: Distribution, n: number): { th: Record<number, number>; ev: number } {
  let evContinue = 0;
  for (let i = 0; i < dist.values.length; i++) evContinue += dist.probs[i] * dist.values[i];
  const th: Record<number, number> = {};
  for (let k = n - 1; k >= 1; k--) {
    let thresh: number;
    if (dist.isDiscrete) {
      thresh = dist.neverVal;
      for (let i = 0; i < dist.values.length; i++) {
        if (dist.values[i] > evContinue) {
          thresh = dist.values[i];
          break;
        }
      }
    } else {
      thresh = evContinue;
    }
    th[k] = thresh;
    let stopPart = 0;
    let contProb = 0;
    for (let i = 0; i < dist.values.length; i++) {
      if (dist.values[i] >= thresh) stopPart += dist.probs[i] * dist.values[i];
      else contProb += dist.probs[i];
    }
    evContinue = stopPart + contProb * evContinue;
  }
  return { th, ev: evContinue };
}

function sampleValue(source: Source, D: number, mu: number, sigma: number): number {
  if (source === "dice") {
    let sum = 0;
    for (let i = 0; i < D; i++) sum += 1 + Math.floor(Math.random() * 6);
    return sum;
  }
  const u = 1 - Math.random();
  const v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function playOne(
  n: number,
  th: Record<number, number>,
  source: Source,
  D: number,
  mu: number,
  sigma: number,
): { value: number; stoppedAt: number } {
  for (let k = 1; k <= n; k++) {
    const val = sampleValue(source, D, mu, sigma);
    if (k === n || val >= th[k]) return { value: val, stoppedAt: k };
  }
  return { value: 0, stoppedAt: n };
}

function fmt(v: number, source: Source): string {
  return Number.isInteger(v) && source === "dice" ? String(v) : v.toFixed(2);
}

function clampCount(v: number): number {
  if (!v || v < 1) return 1;
  if (v > 200000) return 200000;
  return v;
}

// Generalizes the active thresholds (indexed by roll number) to a lookup by
// "rolls remaining after this roll" — the quantity that actually determines
// the optimal threshold — so a custom rule can be projected onto other N's
// for the EV-vs-N comparison chart.
function remainingMap(N: number, activeTh: Record<number, number>): Record<number, number> {
  const map: Record<number, number> = {};
  for (const kStr in activeTh) {
    const k = Number(kStr);
    map[N - k] = activeTh[k];
  }
  return map;
}

function thresholdForRemaining(
  dist: Distribution,
  remaining: number,
  remMap: Record<number, number>,
): number {
  if (remMap[remaining] !== undefined) return remMap[remaining];
  return optimalThresholds(dist, remaining + 1).th[1];
}

function yourRuleEV(dist: Distribution, n: number, remMap: Record<number, number>): number {
  let ev = 0;
  for (let i = 0; i < dist.values.length; i++) ev += dist.probs[i] * dist.values[i];
  for (let k = n - 1; k >= 1; k--) {
    const remaining = n - k;
    const t = thresholdForRemaining(dist, remaining, remMap);
    let stopPart = 0;
    let contProb = 0;
    for (let i = 0; i < dist.values.length; i++) {
      if (dist.values[i] >= t) stopPart += dist.probs[i] * dist.values[i];
      else contProb += dist.probs[i];
    }
    ev = stopPart + contProb * ev;
  }
  return ev;
}

// ---------- small UI building blocks ----------

function ParamGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function SegButtons<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
            value === opt.value
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex-1">
      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-500">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800">
      <div
        className={`text-lg font-bold tabular-nums ${
          accent ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">{label}</div>
    </div>
  );
}

// ---------- charts ----------

function RuleChart({
  dist,
  th,
  N,
  source,
}: {
  dist: Distribution;
  th: Record<number, number>;
  N: number;
  source: Source;
}) {
  const W = 130;
  const H = 200;
  const padL = 30;
  const padR = 6;
  const padT = 8;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const range = dist.max - dist.min || 1;
  const yPx = (v: number) => padT + plotH * (1 - (Math.min(v, dist.max) - dist.min) / range);
  const gap = plotW / N;
  const barW = gap * 0.6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[200px] w-[130px] shrink-0"
      role="img"
      aria-label="Keep-threshold by roll"
    >
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" />
      <text x={padL - 4} y={padT + 8} textAnchor="end" fontSize={8} className="fill-zinc-500">
        {fmt(dist.max, source)}
      </text>
      <text x={padL - 4} y={H - padB} textAnchor="end" fontSize={8} className="fill-zinc-500">
        {fmt(dist.min, source)}
      </text>
      {Array.from({ length: N }, (_, i) => i + 1).map((k) => {
        const isLast = k === N;
        const barTop = isLast ? dist.min : th[k];
        const cx = padL + gap * (k - 0.5);
        const top = yPx(barTop ?? dist.min);
        const bottom = H - padB;
        return (
          <g key={k}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(1, bottom - top)}
              className={isLast ? "fill-amber-300/60 dark:fill-amber-900/70" : "fill-amber-500 dark:fill-amber-500"}
            />
            <text x={cx} y={H - padB + 12} textAnchor="middle" fontSize={8} className="fill-zinc-500">
              R{k}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RunningAverageChart({ history, activeEV }: { history: number[]; activeEV: number }) {
  const W = 500;
  const H = 160;
  const padL = 48;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let yMin: number;
  let yMax: number;
  if (history.length < 2) {
    yMin = activeEV - 1;
    yMax = activeEV + 1;
  } else {
    const dMin = Math.min(...history, activeEV);
    const dMax = Math.max(...history, activeEV);
    const pad = Math.max((dMax - dMin) * 0.25, 0.15);
    yMin = dMin - pad;
    yMax = dMax + pad;
  }
  const yToPx = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin || 1));
  const xToPx = (i: number) => padL + plotW * (i / Math.max(history.length - 1, 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Running average payoff over trials">
      <line
        x1={padL}
        y1={yToPx(activeEV)}
        x2={W - padR}
        y2={yToPx(activeEV)}
        className="stroke-amber-400 dark:stroke-amber-600"
        strokeDasharray="6 5"
        strokeWidth={1.5}
      />
      <text x={padL - 6} y={Math.max(10, yToPx(activeEV) - 4)} textAnchor="end" fontSize={10} className="fill-zinc-500">
        {activeEV.toFixed(3)} (exact)
      </text>
      <text x={padL - 6} y={padT + 8} textAnchor="end" fontSize={10} className="fill-zinc-500">
        {yMax.toFixed(2)}
      </text>
      <text x={padL - 6} y={H - padB} textAnchor="end" fontSize={10} className="fill-zinc-500">
        {yMin.toFixed(2)}
      </text>
      {history.length >= 2 && (
        <polyline
          fill="none"
          className="stroke-amber-500"
          strokeWidth={2}
          points={history.map((v, i) => `${xToPx(i)},${yToPx(v)}`).join(" ")}
        />
      )}
      {history.length > 0 && (
        <circle cx={xToPx(history.length - 1)} cy={yToPx(history[history.length - 1])} r={3} className="fill-amber-500" />
      )}
      <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" fontSize={10} className="fill-zinc-500">
        game number (simulated trial)
      </text>
    </svg>
  );
}

function EVCurveChart({
  dist,
  N,
  activeTh,
  strategy,
}: {
  dist: Distribution;
  N: number;
  activeTh: Record<number, number>;
  strategy: Strategy;
}) {
  const pts = N_OPTIONS.map((n) => optimalThresholds(dist, n).ev);
  const remMap = remainingMap(N, activeTh);
  const pts2 = N_OPTIONS.map((n) => yourRuleEV(dist, n, remMap));
  const showSecond = strategy === "custom";

  const W = 500;
  const H = 150;
  const padL = 42;
  const padR = 10;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const allVals = showSecond ? pts.concat(pts2) : pts;
  const yMin = Math.min(...allVals) - 0.3;
  const yMax = Math.max(...allVals) + 0.3;
  const xToPx = (i: number) => padL + plotW * (i / (N_OPTIONS.length - 1));
  const yToPx = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin || 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Expected value versus number of rolls allowed">
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" />
      {N_OPTIONS.map((n, i) => (
        <text key={n} x={xToPx(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} className="fill-zinc-500">
          N={n}
        </text>
      ))}
      <polyline
        fill="none"
        className="stroke-amber-500"
        strokeWidth={2}
        points={pts.map((v, i) => `${xToPx(i)},${yToPx(v)}`).join(" ")}
      />
      {showSecond && (
        <polyline
          fill="none"
          className="stroke-emerald-500"
          strokeWidth={2}
          strokeDasharray="6 5"
          points={pts2.map((v, i) => `${xToPx(i)},${yToPx(v)}`).join(" ")}
        />
      )}
      {N_OPTIONS.map((n, i) => (
        <circle
          key={`a${n}`}
          cx={xToPx(i)}
          cy={yToPx(pts[i])}
          r={n === N ? 4 : 3}
          className={n === N ? "fill-zinc-900 dark:fill-zinc-50" : "fill-amber-500"}
        />
      ))}
      {showSecond &&
        N_OPTIONS.map((n, i) => (
          <circle
            key={`b${n}`}
            cx={xToPx(i)}
            cy={yToPx(pts2[i])}
            r={n === N ? 4 : 3}
            className={n === N ? "fill-zinc-900 dark:fill-zinc-50" : "fill-emerald-500"}
          />
        ))}
      {showSecond && (
        <g>
          <text x={padL} y={padT - 4} fontSize={9} className="fill-amber-600 dark:fill-amber-400">
            ● optimal
          </text>
          <text x={padL + 58} y={padT - 4} fontSize={9} className="fill-emerald-600 dark:fill-emerald-400">
            - - your rule
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------- main component ----------

export function OptimalStoppingSimulator() {
  const [source, setSource] = useState<Source>("dice");
  const [D, setD] = useState<1 | 2 | 3>(1);
  const [mu, setMu] = useState(10);
  const [sigma, setSigma] = useState(3);
  const [N, setN] = useState<NOption>(3);
  const [strategy, setStrategy] = useState<Strategy>("optimal");
  const [customTh, setCustomTh] = useState<Record<number, number>>({});
  const [trialCount, setTrialCount] = useState(50);

  const [simTotal, setSimTotal] = useState(0);
  const [simCount, setSimCount] = useState(0);
  const [simRollsTotal, setSimRollsTotal] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [liveRoll, setLiveRoll] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [slowRunning, setSlowRunning] = useState(false);

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const dist = useMemo(() => getDistribution(source, D, mu, sigma), [source, D, mu, sigma]);
  const optResult = useMemo(() => optimalThresholds(dist, N), [dist, N]);

  // Custom thresholds reset to the optimal rule whenever the value domain or
  // roll count changes — matching the original tool: edits to a custom rule
  // only persist while D/N/(μ,σ) stay fixed. The running simulation resets
  // too, since a previous run no longer reflects the current setup. Adjusted
  // during render (React's documented pattern for resetting state when
  // derived inputs change) rather than in an effect, to avoid an extra
  // render pass.
  const domainKey = `${source}|${D}|${mu}|${sigma}|${N}`;
  const [seededDomainKey, setSeededDomainKey] = useState(domainKey);
  if (domainKey !== seededDomainKey) {
    setSeededDomainKey(domainKey);
    setCustomTh(optResult.th);
    setHasRun(false);
    setHistory([]);
    setSimTotal(0);
    setSimCount(0);
    setSimRollsTotal(0);
    setLiveRoll(null);
  }

  const activeTh = strategy === "optimal" ? optResult.th : customTh;
  const activeEV = useMemo(() => computeEV(dist, N, activeTh), [dist, N, activeTh]);
  const isCustomOptimal = useMemo(
    () =>
      Object.keys(optResult.th).every(
        (k) => Math.abs((customTh[Number(k)] ?? Infinity) - optResult.th[Number(k)]) < 1e-6,
      ),
    [customTh, optResult],
  );

  function resetSim() {
    if (slowRunning) return;
    setSimTotal(0);
    setSimCount(0);
    setSimRollsTotal(0);
    setHistory([]);
    setLiveRoll(null);
    setHasRun(false);
  }

  function runInstant() {
    if (slowRunning) return;
    const count = clampCount(trialCount);
    let total = 0;
    let count2 = 0;
    let rollsTotal = 0;
    const hist: number[] = [];
    const sampleEvery = Math.max(1, Math.floor(count / 150));
    for (let i = 0; i < count; i++) {
      const { value, stoppedAt } = playOne(N, activeTh, source, D, mu, sigma);
      total += value;
      rollsTotal += stoppedAt;
      count2 += 1;
      if (i % sampleEvery === 0 || i === count - 1) hist.push(total / count2);
    }
    setHasRun(true);
    setSimTotal(total);
    setSimCount(count2);
    setSimRollsTotal(rollsTotal);
    setHistory(hist);
    setLiveRoll(null);
  }

  function runSlowly() {
    if (slowRunning) return;
    const count = Math.min(clampCount(trialCount), 300);
    setHasRun(true);
    setSlowRunning(true);
    let total = 0;
    let count2 = 0;
    let rollsTotal = 0;
    const hist: number[] = [];
    const totalMs = 6000;
    const delay = Math.max(8, Math.min(200, totalMs / count));
    let i = 0;
    const step = () => {
      if (i >= count) {
        setSlowRunning(false);
        setLiveRoll(null);
        return;
      }
      const { value, stoppedAt } = playOne(N, activeTh, source, D, mu, sigma);
      total += value;
      rollsTotal += stoppedAt;
      count2 += 1;
      hist.push(total / count2);
      setSimTotal(total);
      setSimCount(count2);
      setSimRollsTotal(rollsTotal);
      setHistory([...hist]);
      setLiveRoll(
        `game ${i + 1}/${count} → payoff ${fmt(value, source)} at roll ${stoppedAt} · running avg ${(total / count2).toFixed(3)}`,
      );
      i++;
      slowTimerRef.current = setTimeout(step, delay);
    };
    step();
  }

  const gapToExact = simCount > 0 ? Math.abs(simTotal / simCount - activeEV) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Optimal Stopping Simulator
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {source === "dice" ? (
          <>
            Each roll, throw <b className="text-zinc-800 dark:text-zinc-200">D dice</b> and sum
            them. You get up to <b className="text-zinc-800 dark:text-zinc-200">N</b> rolls.
            After each roll except the last, decide: keep it, or reroll? The final roll must be
            kept.
          </>
        ) : (
          <>
            Each roll draws a value from a{" "}
            <b className="text-zinc-800 dark:text-zinc-200">Normal(μ, σ)</b> distribution. You get
            up to <b className="text-zinc-800 dark:text-zinc-200">N</b> rolls. After each roll
            except the last, decide: keep it, or reroll? The final roll must be kept.
          </>
        )}
      </p>

      <div className="mt-6 space-y-5">
        <ParamGroup label="Random source">
          <SegButtons
            disabled={slowRunning}
            value={source}
            onChange={setSource}
            options={[
              { value: "dice", label: "Dice" },
              { value: "normal", label: "Normal (μ, σ)" },
            ]}
          />
        </ParamGroup>

        {source === "dice" ? (
          <ParamGroup label="Number of dice per roll (D)">
            <SegButtons
              disabled={slowRunning}
              value={D}
              onChange={setD}
              options={[
                { value: 1 as const, label: "1" },
                { value: 2 as const, label: "2" },
                { value: 3 as const, label: "3" },
              ]}
            />
          </ParamGroup>
        ) : (
          <div className="flex gap-4">
            <NumberField label="Mean (μ)" value={mu} step={1} disabled={slowRunning} onChange={setMu} />
            <NumberField
              label="Std dev (σ)"
              value={sigma}
              step={0.5}
              min={0.1}
              disabled={slowRunning}
              onChange={(v) => setSigma(Math.max(0.1, v || 0.1))}
            />
          </div>
        )}

        <ParamGroup label="Number of rolls allowed (N)">
          <SegButtons
            disabled={slowRunning}
            value={N}
            onChange={setN}
            options={N_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          />
        </ParamGroup>

        <ParamGroup label="Strategy">
          <SegButtons
            disabled={slowRunning}
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: "optimal" as const, label: "Optimal rule" },
              { value: "custom" as const, label: "Your own thresholds" },
            ]}
          />
        </ParamGroup>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
          <span>{strategy === "optimal" ? "Optimal rule (maximizes EV)" : "Your rule (edit thresholds)"}</span>
          {strategy === "custom" && isCustomOptimal && (
            <span className="text-[11px] font-semibold text-emerald-600 normal-case dark:text-emerald-400">
              ✓ optimal
            </span>
          )}
        </div>

        {strategy === "optimal" ? (
          <div className="mt-3 flex items-stretch gap-4">
            <div className="min-w-0 flex-1 space-y-1.5 text-sm">
              {Array.from({ length: N - 1 }, (_, i) => i + 1).map((k) => (
                <div
                  key={k}
                  className="flex gap-2 border-b border-zinc-100 pb-1.5 last:border-0 dark:border-zinc-800"
                >
                  <span className="w-14 shrink-0 text-zinc-500 dark:text-zinc-500">Roll {k}</span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    Keep if &ge;{" "}
                    <b className="font-semibold text-amber-600 dark:text-amber-400">
                      {fmt(activeTh[k], source)}
                    </b>
                    , else reroll.
                  </span>
                </div>
              ))}
              <div className="flex gap-2 pb-1.5">
                <span className="w-14 shrink-0 text-zinc-500 dark:text-zinc-500">Roll {N}</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  Final roll &mdash; <b className="font-semibold">always keep it</b>.
                </span>
              </div>
            </div>
            <RuleChart dist={dist} th={activeTh} N={N} source={source} />
          </div>
        ) : (
          <div className="mt-3 max-h-64 space-y-4 overflow-y-auto pr-1">
            {Array.from({ length: N - 1 }, (_, i) => i + 1).map((k) => {
              const v = customTh[k] ?? optResult.th[k];
              const label = v > dist.max ? "never" : fmt(v, source);
              const step = dist.isDiscrete ? 1 : (dist.max - dist.min) / 200;
              return (
                <div key={k}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">Roll {k} &mdash; keep if &ge;</span>
                    <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={dist.min}
                    max={dist.neverVal}
                    step={step}
                    value={v}
                    disabled={slowRunning}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCustomTh((prev) => ({ ...prev, [k]: val }));
                    }}
                    className="w-full accent-amber-600 disabled:opacity-40"
                  />
                </div>
              );
            })}
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Roll {N} &mdash; final roll, always keep it.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="number"
          min={1}
          max={200000}
          value={trialCount}
          disabled={slowRunning}
          onChange={(e) => setTrialCount(Number(e.target.value))}
          className="w-28 rounded-md border border-zinc-300 px-3 text-center text-sm disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={runInstant}
          disabled={slowRunning}
          className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Run instantly
        </button>
      </div>
      <button
        type="button"
        onClick={runSlowly}
        disabled={slowRunning}
        className="mt-2 w-full rounded-md border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-50 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-950/40"
      >
        {slowRunning ? "Running…" : "Run slowly (watch it converge)"}
      </button>
      {strategy === "custom" && (
        <button
          type="button"
          onClick={() => setCustomTh(optResult.th)}
          disabled={slowRunning}
          className="mt-2 w-full rounded-md border border-emerald-600/40 px-4 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
        >
          Reset thresholds to optimal
        </button>
      )}
      <button
        type="button"
        onClick={resetSim}
        disabled={slowRunning}
        className="mt-2 w-full rounded-md border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-500 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
      >
        Reset simulation
      </button>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          value={activeEV.toFixed(3)}
          label={strategy === "optimal" ? "exact EV" : "exact EV (yours)"}
          accent
        />
        <Stat value={simCount ? (simTotal / simCount).toFixed(3) : "–"} label="simulated avg" />
        <Stat
          value={simCount ? `${(simRollsTotal / simCount).toFixed(2)} / ${N}` : "–"}
          label="avg roll stopped at"
        />
      </div>

      {hasRun && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Running average (should converge to exact EV)
          </div>
          <div className="mt-2">
            <RunningAverageChart history={history} activeEV={activeEV} />
          </div>
          <div className="mt-1 min-h-[18px] text-center text-xs text-zinc-500 dark:text-zinc-500">
            {liveRoll ?? " "}
          </div>
        </div>
      )}

      {hasRun && gapToExact !== null && (
        <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-500">
          Total games played: {simCount.toLocaleString()} · gap to exact EV: {gapToExact.toFixed(4)}
        </p>
      )}

      {hasRun && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            EV vs N &mdash; optimal, and your rule if custom
          </div>
          <div className="mt-2">
            <EVCurveChart dist={dist} N={N} activeTh={activeTh} strategy={strategy} />
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
        <strong className="text-zinc-700 dark:text-zinc-400">The math:</strong> the optimal rule
        is found by backward induction &mdash; starting from the last roll (always kept) and
        working backward, each roll&rsquo;s keep-threshold is set to the expected value of
        continuing with the rolls remaining after it.
      </p>
    </div>
  );
}
