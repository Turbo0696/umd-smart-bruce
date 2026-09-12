// A profit-by-dyad chart: one bar per dyad, stacked from retailer- and
// wholesaler-colored segments, so the allocation within a single dyad's
// chain profit is visible without needing two separate bars to compare —
// the point of the debrief section this lives in is "the price you agreed
// to is a pure transfer between you two," which one solid chain-profit bar
// doesn't show at all. Deliberately its own small chart rather than an
// extension of the shared BarChart.tsx: profit here can go negative (a
// thin-margin agreed price with heavy holding/ordering costs), so stacking
// has to be sign-aware — a negative segment stacks downward from zero
// rather than on top of a positive one — which BarChart's other callers
// (dice/random-babies frequency charts, always non-negative) don't need.
const WIDTH = 640;
const HEIGHT = 280;
const PAD_LEFT = 48;
const PAD_BOTTOM = 32;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const RETAILER_COLOR = "#2563eb";
const WHOLESALER_COLOR = "#059669";
const MAX_COLOR = "#a1a1aa";

export type DyadProfitBar = {
  label: string;
  retailerProfit: number;
  wholesalerProfit: number;
};

// Stacks same-sign values on their own side of zero (each subsequent
// positive value stacks above the last; each subsequent negative value
// stacks below). A mix of signs just puts one part above the baseline and
// the other below — still one bar at one x position, split at zero rather
// than piled on top of each other.
function stack(parts: { value: number; color: string; title: string }[]) {
  let posCursor = 0;
  let negCursor = 0;
  return parts.map(({ value, color, title }) => {
    const from = value >= 0 ? posCursor : negCursor + value;
    const to = value >= 0 ? posCursor + value : negCursor;
    if (value >= 0) posCursor = to;
    else negCursor = from;
    return { from, to, color, title, value };
  });
}

export function ProfitAllocationChart({
  maxLabel,
  maxValue,
  dyads,
}: {
  maxLabel: string;
  maxValue: number;
  dyads: DyadProfitBar[];
}) {
  const stacks = dyads.map((d) =>
    stack([
      { value: d.wholesalerProfit, color: WHOLESALER_COLOR, title: `${d.label} wholesaler` },
      { value: d.retailerProfit, color: RETAILER_COLOR, title: `${d.label} retailer` },
    ]),
  );

  const allBounds = [maxValue, 0, ...stacks.flatMap((s) => s.flatMap((p) => [p.from, p.to]))];
  const hi = Math.max(...allBounds, 1);
  const lo = Math.min(...allBounds, 0);
  const range = hi - lo || 1;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const yOf = (v: number) => PAD_TOP + plotHeight - ((v - lo) / range) * plotHeight;
  const zeroY = yOf(0);

  const slots = 1 + dyads.length;
  const slotWidth = plotWidth / slots;
  const barWidth = Math.min(slotWidth * 0.5, 40);

  function segment(x: number, from: number, to: number, color: string, title: string) {
    const y1 = yOf(Math.max(from, to));
    const y2 = yOf(Math.min(from, to));
    return (
      <rect key={title} x={x} y={y1} width={barWidth} height={Math.max(y2 - y1, 0)} rx={2} fill={color}>
        <title>{`${title}: $${Math.round(to - from).toLocaleString()}`}</title>
      </rect>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[480px]" role="img">
        <line
          x1={PAD_LEFT}
          y1={zeroY}
          x2={WIDTH - PAD_RIGHT}
          y2={zeroY}
          className="stroke-zinc-300 dark:stroke-zinc-600"
        />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={HEIGHT - PAD_BOTTOM}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />

        {(() => {
          const cx = PAD_LEFT + slotWidth / 2;
          return (
            <g key="max">
              {segment(cx - barWidth / 2, 0, maxValue, MAX_COLOR, maxLabel)}
              <text
                x={cx}
                y={HEIGHT - PAD_BOTTOM + 16}
                textAnchor="middle"
                className="fill-zinc-500 dark:fill-zinc-400"
                fontSize={11}
              >
                {maxLabel}
              </text>
            </g>
          );
        })()}

        {dyads.map((d, i) => {
          const cx = PAD_LEFT + slotWidth * (i + 1) + slotWidth / 2;
          const x = cx - barWidth / 2;
          return (
            <g key={d.label}>
              {stacks[i].map((p) => segment(x, p.from, p.to, p.color, p.title))}
              <text
                x={cx}
                y={HEIGHT - PAD_BOTTOM + 16}
                textAnchor="middle"
                className="fill-zinc-500 dark:fill-zinc-400"
                fontSize={11}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <Legend color={RETAILER_COLOR} label="Retailer" />
        <Legend color={WHOLESALER_COLOR} label="Wholesaler" />
        <Legend color={MAX_COLOR} label={maxLabel} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
