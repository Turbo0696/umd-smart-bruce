// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Grouped bars: one cluster per group (a team), one bar per series (a role).
// Same chart as siemsene/beergame's TeamRoleStdDevGroupedBarChart.tsx, but
// reimplemented in the plain-SVG idiom this repo already uses in BarChart.tsx
// rather than pulling in a charting library. See NOTICE.md for attribution.

type Group = {
  label: string;
  /** One value per series, in the same order as `series`. */
  values: number[];
};

type Series = {
  label: string;
  color: string;
};

const WIDTH = 720;
const HEIGHT = 300;
const PAD_LEFT = 44;
const PAD_BOTTOM = 52;
const PAD_TOP = 12;
const PAD_RIGHT = 12;

export function GroupedBarChart({
  groups,
  series,
  valueFormatter = (v: number) => v.toFixed(2),
}: {
  groups: Group[];
  series: Series[];
  valueFormatter?: (value: number) => string;
}) {
  if (groups.length === 0 || series.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Nothing to chart yet.
      </p>
    );
  }

  const maxValue = Math.max(...groups.flatMap((g) => g.values), 1);
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const groupSlot = plotWidth / groups.length;
  // Leave a fifth of each cluster as breathing room between teams.
  const barWidth = Math.min((groupSlot * 0.8) / series.length, 22);

  const y = (value: number) =>
    PAD_TOP + plotHeight - (value / maxValue) * plotHeight;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full min-w-[560px]"
        role="img"
      >
        <line
          x1={PAD_LEFT}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_RIGHT}
          y2={HEIGHT - PAD_BOTTOM}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={HEIGHT - PAD_BOTTOM}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
        <text
          x={PAD_LEFT - 6}
          y={PAD_TOP + 8}
          textAnchor="end"
          className="fill-zinc-500 text-[10px]"
        >
          {valueFormatter(maxValue)}
        </text>
        <text
          x={PAD_LEFT - 6}
          y={HEIGHT - PAD_BOTTOM + 4}
          textAnchor="end"
          className="fill-zinc-500 text-[10px]"
        >
          0
        </text>

        {groups.map((group, groupIndex) => {
          const clusterCenter = PAD_LEFT + groupSlot * groupIndex + groupSlot / 2;
          const clusterWidth = barWidth * series.length;
          const clusterStart = clusterCenter - clusterWidth / 2;

          return (
            <g key={group.label}>
              {series.map((s, seriesIndex) => {
                const value = group.values[seriesIndex] ?? 0;
                const barY = y(value);
                return (
                  <rect
                    key={s.label}
                    x={clusterStart + barWidth * seriesIndex}
                    y={barY}
                    width={Math.max(barWidth - 1, 1)}
                    height={Math.max(HEIGHT - PAD_BOTTOM - barY, 0)}
                    rx={2}
                    fill={s.color}
                  >
                    <title>{`${group.label} — ${s.label}: ${valueFormatter(value)}`}</title>
                  </rect>
                );
              })}
              <text
                x={clusterCenter}
                y={HEIGHT - PAD_BOTTOM + 16}
                textAnchor="end"
                transform={`rotate(-35 ${clusterCenter} ${HEIGHT - PAD_BOTTOM + 16})`}
                className="fill-zinc-500 dark:fill-zinc-400"
                fontSize={10}
              >
                {group.label}
              </text>
            </g>
          );
        })}
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
