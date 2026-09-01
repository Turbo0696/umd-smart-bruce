type Bar = {
  label: string;
  value: number;
};

const WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 40;
const PAD_BOTTOM = 32;
const PAD_TOP = 12;
const PAD_RIGHT = 12;

export function BarChart({ bars, color = "#2563eb" }: { bars: Bar[]; color?: string }) {
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / bars.length;
  const barWidth = Math.min(slot * 0.7, 48);

  const y = (value: number) => PAD_TOP + plotHeight - (value / maxValue) * plotHeight;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full min-w-[480px]"
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
        {bars.map((b, i) => {
          const cx = PAD_LEFT + slot * i + slot / 2;
          const barY = y(b.value);
          return (
            <g key={b.label}>
              <rect
                x={cx - barWidth / 2}
                y={barY}
                width={barWidth}
                height={HEIGHT - PAD_BOTTOM - barY}
                rx={3}
                fill={color}
              />
              <text
                x={cx}
                y={HEIGHT - PAD_BOTTOM + 16}
                textAnchor="middle"
                className="fill-zinc-500 dark:fill-zinc-400"
                fontSize={11}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
