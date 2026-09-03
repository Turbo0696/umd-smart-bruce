"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Payoff matrix, shared by both modes below. Adding "abstain" turns the
// classic 2-strategy dilemma into a rock-paper-scissors-like cycle:
// defectors beat cooperators, abstainers (safe, but low-value) beat
// defectors by refusing to engage, and cooperators beat abstainers by
// earning the higher mutual-cooperation reward together.
const PAYOFF = { T: 5, R: 3, L: 2, P: 1, S: 0 } as const;

type Move = "cooperate" | "defect" | "abstain";

function resolveRound(player: Move, opponent: Move): { pScore: number; oScore: number } {
  if (player === "abstain" || opponent === "abstain") {
    return { pScore: PAYOFF.L, oScore: PAYOFF.L };
  }
  if (player === "cooperate" && opponent === "cooperate") {
    return { pScore: PAYOFF.R, oScore: PAYOFF.R };
  }
  if (player === "defect" && opponent === "defect") {
    return { pScore: PAYOFF.P, oScore: PAYOFF.P };
  }
  if (player === "defect" && opponent === "cooperate") {
    return { pScore: PAYOFF.T, oScore: PAYOFF.S };
  }
  return { pScore: PAYOFF.S, oScore: PAYOFF.T }; // player cooperate, opponent defect
}

const MOVE_META: Record<Move, { icon: string; label: string }> = {
  cooperate: { icon: "🤝", label: "Cooperate" },
  defect: { icon: "⚔️", label: "Defect" },
  abstain: { icon: "🛡️", label: "Abstain" },
};

export function PrisonersDilemmaSimulator() {
  const [mode, setMode] = useState<"play" | "sim">("play");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Prisoner&rsquo;s Dilemma + Loners
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        A three-way twist on the classic game theory staple: alongside
        cooperate and defect, either side can abstain for a guaranteed,
        modest payoff that avoids the risk of being exploited. Play a match
        against an AI opponent, or watch a whole population of strategies
        evolve on a grid, generation by generation.
      </p>

      <div className="mt-6 inline-flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        <button
          onClick={() => setMode("play")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "play"
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          }`}
        >
          Play vs AI
        </button>
        <button
          onClick={() => setMode("sim")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "sim"
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          }`}
        >
          Evolution Sim
        </button>
      </div>

      <div className="mt-6">{mode === "play" ? <PlayVsAi /> : <EvolutionSim />}</div>

      <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
        <strong className="text-zinc-700 dark:text-zinc-400">
          Rock-paper-scissors dynamics:
        </strong>{" "}
        defectors beat cooperators, abstainers (loners) beat defectors by
        refusing to play, and cooperators beat abstainers by earning higher
        rewards together.
      </p>
    </div>
  );
}

// --- Mode 1: head-to-head against a scripted AI opponent ---

type AiStrategyKey =
  | "tit_for_tat"
  | "always_defect"
  | "always_coop"
  | "always_abstain"
  | "random";

type Round = { player: Move; ai: Move; pScore: number; aScore: number };

const AI_STRATEGIES: Record<
  AiStrategyKey,
  { label: string; description: string; pick: (history: Round[]) => Move }
> = {
  tit_for_tat: {
    label: "Tit for Tat (Mirror)",
    description: "Mirror: starts cooperative, then copies your exact last move.",
    pick: (history) =>
      history.length === 0 ? "cooperate" : history[history.length - 1].player,
  },
  always_defect: {
    label: "Always Defect (Aggro)",
    description: "Aggressive: always chooses to defect. Dangerous if you cooperate.",
    pick: () => "defect",
  },
  always_coop: {
    label: "Always Cooperate (Naive)",
    description: "Naive: always cooperates. Free points for you.",
    pick: () => "cooperate",
  },
  always_abstain: {
    label: "Always Abstain (Loner)",
    description: "Loner: refuses to play. Always takes the safe 2 points.",
    pick: () => "abstain",
  },
  random: {
    label: "Random (Chaotic)",
    description: "Chaotic: picks one of the three options randomly.",
    pick: () => {
      const r = Math.random();
      if (r < 0.33) return "cooperate";
      if (r < 0.66) return "defect";
      return "abstain";
    },
  },
};

function PlayVsAi() {
  const [strategyKey, setStrategyKey] = useState<AiStrategyKey>("tit_for_tat");
  const [history, setHistory] = useState<Round[]>([]);
  const [score, setScore] = useState({ player: 0, ai: 0 });

  function reset(next: AiStrategyKey) {
    setStrategyKey(next);
    setHistory([]);
    setScore({ player: 0, ai: 0 });
  }

  function playRound(playerMove: Move) {
    const aiMove = AI_STRATEGIES[strategyKey].pick(history);
    const { pScore, oScore: aScore } = resolveRound(playerMove, aiMove);
    setScore((s) => ({ player: s.player + pScore, ai: s.ai + aScore }));
    setHistory((h) => [...h, { player: playerMove, ai: aiMove, pScore, aScore }]);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Opponent strategy
          </label>
          <select
            value={strategyKey}
            onChange={(e) => reset(e.target.value as AiStrategyKey)}
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {Object.entries(AI_STRATEGIES).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs italic text-zinc-500 dark:text-zinc-500">
            {AI_STRATEGIES[strategyKey].description}
          </p>
          <button
            onClick={() => reset(strategyKey)}
            className="mt-4 w-full rounded-md border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
          >
            Reset match
          </button>
        </div>

        <div className="flex items-center justify-around gap-4 rounded-lg border border-zinc-200 p-4 sm:col-span-2 dark:border-zinc-800">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              You
            </div>
            <div className="font-mono text-3xl font-bold text-blue-600 dark:text-blue-400">
              {score.player}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-400 dark:text-zinc-600">Rounds</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {history.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Opponent
            </div>
            <div className="font-mono text-3xl font-bold text-rose-600 dark:text-rose-400">
              {score.ai}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Make your choice
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Payoffs: <span className="text-emerald-600 dark:text-emerald-400">R=3</span>{" "}
          (mutual coop), <span className="text-rose-600 dark:text-rose-400">T=5</span>{" "}
          (betray), <span className="text-rose-800 dark:text-rose-500">P=1</span>{" "}
          (mutual defect), <span className="text-zinc-600 dark:text-zinc-400">L=2</span>{" "}
          (abstain)
        </p>
      </div>

      <div className="mx-auto mt-4 grid max-w-lg grid-cols-3 gap-3">
        <ChoiceButton
          move="cooperate"
          onClick={playRound}
          hint="Risk betrayal for mutual gain"
          hover="emerald"
        />
        <ChoiceButton
          move="abstain"
          onClick={playRound}
          hint="Guaranteed safety (L=2)"
          hover="zinc"
        />
        <ChoiceButton
          move="defect"
          onClick={playRound}
          hint="Maximize gain at the other&rsquo;s expense"
          hover="rose"
        />
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-500">
          Match history
        </div>
        <div className="flex h-12 items-center gap-2 overflow-x-auto">
          {history.length === 0 ? (
            <span className="px-2 text-sm italic text-zinc-400 dark:text-zinc-600">
              No moves yet…
            </span>
          ) : (
            [...history]
              .reverse()
              .map((r, i) => <HistoryChip key={history.length - i} round={r} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  move,
  onClick,
  hint,
  hover,
}: {
  move: Move;
  onClick: (m: Move) => void;
  hint: string;
  hover: "emerald" | "rose" | "zinc";
}) {
  const hoverClass = {
    emerald: "hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    rose: "hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30",
    zinc: "hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
  }[hover];
  const meta = MOVE_META[move];
  return (
    <button
      onClick={() => onClick(move)}
      className={`rounded-xl border-2 border-zinc-200 p-4 text-center transition-colors dark:border-zinc-700 ${hoverClass}`}
    >
      <div className="text-2xl">{meta.icon}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {meta.label}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-500">{hint}</div>
    </button>
  );
}

function HistoryChip({ round }: { round: Round }) {
  const { player, ai } = round;
  let icon = "🤝";
  let classes = "border-blue-300 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10";

  if (player === "abstain" || ai === "abstain") {
    icon = "🛡️";
    classes = "border-zinc-300 bg-zinc-100 dark:border-zinc-500/30 dark:bg-zinc-500/10";
  } else if (player === "defect" && ai === "defect") {
    icon = "⚔️";
    classes = "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10";
  } else if (player === "defect") {
    icon = "💰"; // you defected, they cooperated — you won big
    classes = "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10";
  } else if (ai === "defect") {
    icon = "💀"; // you cooperated, they defected — you got burned
    classes = "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10";
  }

  return (
    <div
      title={`You: ${player}, AI: ${ai}`}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-lg ${classes}`}
    >
      {icon}
    </div>
  );
}

// --- Mode 2: spatial evolution simulation ---
//
// A GRID_SIZE x GRID_SIZE grid where every cell plays every one of its 8
// neighbors (wrapping at the edges) and totals the payoff. Each cell then
// copies whichever strategy — its own or a neighbor's — scored highest,
// generation after generation. Rendered on a <canvas> at a fixed pixel
// resolution and scaled responsively via CSS, rather than resized to the
// container on every layout change.

const GRID_SIZE = 50;
const CELL_PX = 8;
const CANVAS_PX = GRID_SIZE * CELL_PX;

type Cell = 0 | 1 | 2; // 0 = defect, 1 = cooperate, 2 = abstain

function makeGrid(): Cell[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<Cell>(GRID_SIZE).fill(0));
}

function randomGrid(coopPct: number, abstainPct: number): Cell[][] {
  const grid = makeGrid();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const r = Math.random() * 100;
      grid[y][x] = r < coopPct ? 1 : r < coopPct + abstainPct ? 2 : 0;
    }
  }
  return grid;
}

function scoreAt(grid: Cell[][], y: number, x: number, temptation: number): number {
  const mine = grid[y][x];
  let total = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;
      const ny = (y + dy + GRID_SIZE) % GRID_SIZE;
      const nx = (x + dx + GRID_SIZE) % GRID_SIZE;
      const theirs = grid[ny][nx];
      if (mine === 2 || theirs === 2) total += PAYOFF.L;
      else if (mine === 1 && theirs === 1) total += PAYOFF.R;
      else if (mine === 0 && theirs === 0) total += PAYOFF.P;
      else if (mine === 0 && theirs === 1) total += temptation;
      else total += PAYOFF.S;
    }
  }
  return total;
}

function evolve(grid: Cell[][], temptation: number): Cell[][] {
  const scores = grid.map((row, y) => row.map((_, x) => scoreAt(grid, y, x, temptation)));
  const next = makeGrid();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      let bestScore = scores[y][x];
      let bestStrat = grid[y][x];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = (y + dy + GRID_SIZE) % GRID_SIZE;
          const nx = (x + dx + GRID_SIZE) % GRID_SIZE;
          if (scores[ny][nx] > bestScore) {
            bestScore = scores[ny][nx];
            bestStrat = grid[ny][nx];
          }
        }
      }
      next[y][x] = bestStrat;
    }
  }
  return next;
}

function tally(grid: Cell[][]): { coop: number; defect: number; abstain: number } {
  let coop = 0;
  let defect = 0;
  let abstain = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 1) coop++;
      else if (cell === 0) defect++;
      else abstain++;
    }
  }
  return { coop, defect, abstain };
}

const CELL_COLOR: Record<Cell, string> = {
  1: "#3b82f6", // blue-500 — cooperate
  0: "#e11d48", // rose-600 — defect
  2: "#94a3b8", // slate-400 — abstain
};

function EvolutionSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors `temptation` state so the running interval's step function
  // (whose closure is fixed at the moment Start was clicked) always
  // reads the slider's *current* value rather than whatever it was when
  // the interval was created.
  const temptationRef = useRef(5);

  const [initCoop, setInitCoop] = useState(33);
  const [initAbstain, setInitAbstain] = useState(33);
  const [temptation, setTemptation] = useState(5);
  const [running, setRunning] = useState(false);
  const [generation, setGeneration] = useState(0);
  // The grid is real React state (not a ref) so the canvas-drawing
  // effect below can simply depend on it — no ref reads during render,
  // which the stricter hooks rules here reject even from a lazy
  // useState initializer.
  const [grid, setGrid] = useState<Cell[][]>(() => randomGrid(initCoop, initAbstain));
  const stats = useMemo(() => tally(grid), [grid]);

  useEffect(() => {
    temptationRef.current = temptation;
  }, [temptation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        ctx.fillStyle = CELL_COLOR[grid[y][x]];
        ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX - 1, CELL_PX - 1);
      }
    }
  }, [grid]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function stop() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }

  function stepOnce() {
    setGrid((g) => evolve(g, temptationRef.current));
    setGeneration((g) => g + 1);
  }

  function toggleRun() {
    if (running) {
      stop();
    } else {
      intervalRef.current = setInterval(stepOnce, 100);
      setRunning(true);
    }
  }

  function handleStep() {
    stop();
    stepOnce();
  }

  function handleReset() {
    stop();
    setGrid(randomGrid(initCoop, initAbstain));
    setGeneration(0);
  }

  function handleInitCoop(v: number) {
    setInitCoop(v);
    stop();
    setGrid(randomGrid(v, initAbstain));
    setGeneration(0);
  }

  function handleInitAbstain(v: number) {
    setInitAbstain(v);
    stop();
    setGrid(randomGrid(initCoop, v));
    setGeneration(0);
  }

  const total = GRID_SIZE * GRID_SIZE;

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-5 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Simulation control
          </h3>
          <div className="flex gap-2">
            <button
              onClick={toggleRun}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium text-white transition-colors ${
                running ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {running ? "Pause" : "Start"}
            </button>
            <button
              onClick={handleReset}
              title="Reset grid"
              className="rounded-md bg-zinc-700 px-3 text-white hover:bg-zinc-600"
            >
              ↻
            </button>
            <button
              onClick={handleStep}
              title="Step one generation"
              className="rounded-md bg-zinc-700 px-3 text-white hover:bg-zinc-600"
            >
              ➝
            </button>
          </div>
        </div>

        <SliderField
          label="Initial cooperators"
          value={initCoop}
          accent="accent-blue-500"
          onChange={handleInitCoop}
          suffix="%"
        />
        <SliderField
          label="Initial abstainers"
          value={initAbstain}
          accent="accent-slate-400"
          onChange={handleInitAbstain}
          suffix="%"
        />

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <SliderField
            label="Temptation (T)"
            value={temptation}
            min={3}
            max={6}
            step={0.1}
            accent="accent-rose-500"
            onChange={setTemptation}
            format={(v) => v.toFixed(1)}
          />
        </div>

        <div className="mt-auto border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatTile
              label="Coop"
              value={`${Math.round((stats.coop / total) * 100)}%`}
              color="text-blue-600 dark:text-blue-400"
            />
            <StatTile
              label="Defect"
              value={`${Math.round((stats.defect / total) * 100)}%`}
              color="text-rose-600 dark:text-rose-400"
            />
            <StatTile
              label="Abstain"
              value={`${Math.round((stats.abstain / total) * 100)}%`}
              color="text-zinc-600 dark:text-zinc-300"
            />
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-500">
            Generation:{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{generation}</span>
          </p>
        </div>
      </div>

      <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-black dark:border-zinc-800">
        <canvas
          ref={canvasRef}
          width={CANVAS_PX}
          height={CANVAS_PX}
          className="h-auto w-full max-w-[500px]"
        />
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1 rounded-md border border-white/10 bg-black/70 px-3 py-2 text-xs text-white backdrop-blur">
          <LegendRow color="bg-blue-500" label="Cooperate (R=3)" />
          <LegendRow color="bg-rose-600" label={`Defect (P=1, T=${temptation.toFixed(1)})`} />
          <LegendRow color="bg-slate-400" label="Abstain (L=2)" />
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  accent,
  suffix = "",
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accent: string;
  suffix?: string;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-500">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`h-2 flex-1 cursor-pointer rounded-lg bg-zinc-200 dark:bg-zinc-700 ${accent}`}
        />
        <span className="w-10 shrink-0 text-right font-mono text-sm text-zinc-700 dark:text-zinc-300">
          {format ? format(value) : value}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-500">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`block h-3 w-3 ${color}`} />
      {label}
    </div>
  );
}
