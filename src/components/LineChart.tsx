type Series = {
  label: string;
  color: string;
  points: number[]; // one value per round, index 0 = round 1
};

const WIDTH = 640;
const HEIGHT = 260;
const PAD = 32;

export function LineChart({
  series,
  minAxisMax,
}: {
  series: Series[];
  /**
   * Floor for the y-axis. Auto-scaling makes a calm supply chain and a wild
   * one look identical, so the Beer Game report passes a fixed floor to keep
   * teams visually comparable at a glance.
   *
   * A floor rather than a hard cap (which is what siemsene pins): charts agree
   * whenever every value is under it, but a genuine spike above it still shows
   * instead of being silently clipped flat at the top of the frame.
   */
  minAxisMax?: number;
}) {
  const rounds = Math.max(...series.map((s) => s.points.length), 1);
  const allValues = series.flatMap((s) => s.points);
  const maxValue = Math.max(minAxisMax ?? 0, ...allValues, 1);

  const x = (roundIndex: number) =>
    PAD + (roundIndex / Math.max(rounds - 1, 1)) * (WIDTH - 2 * PAD);
  const y = (value: number) =>
    HEIGHT - PAD - (value / maxValue) * (HEIGHT - 2 * PAD);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full min-w-[480px]"
        role="img"
      >
        <line
          x1={PAD}
          y1={HEIGHT - PAD}
          x2={WIDTH - PAD}
          y2={HEIGHT - PAD}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={HEIGHT - PAD}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
        {/* Axis bounds. Without these the scale is invisible, which defeats the
            point of holding it steady across charts. */}
        <text
          x={PAD - 6}
          y={y(maxValue) + 4}
          textAnchor="end"
          className="fill-zinc-500 text-[10px]"
        >
          {maxValue}
        </text>
        <text
          x={PAD - 6}
          y={HEIGHT - PAD + 4}
          textAnchor="end"
          className="fill-zinc-500 text-[10px]"
        >
          0
        </text>
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
