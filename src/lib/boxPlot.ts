// Five-number summary, Tukey fences, whiskers, and outliers for a box plot.
//
// Quartiles use the exclusive method — Excel's QUARTILE.EXC (also
// Minitab's default): the p-th quartile sits at position p·(n + 1) in the
// sorted data, interpolating linearly between neighbours when that
// position isn't a whole number. Excel's QUARTILE.INC, which uses
// position p·(n − 1) + 1, can give slightly different Q1/Q3.

export const MIN_BOX_PLOT_N = 4;
/** Smallest sample the random generator will plant outliers in (see below). */
export const MIN_OUTLIER_N = 6;

export type BoxPlotStats = {
  sorted: number[];
  n: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  q1: Quantile;
  medianPos: Quantile;
  q3: Quantile;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  /** Whisker ends: the most extreme values still inside the fences. */
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
};

/** A quantile plus how it was found, for the worked explanation. */
export type Quantile = {
  value: number;
  /** 1-based position p·(n + 1) in the sorted data. */
  position: number;
  /** The two sorted values it interpolates between (equal when whole). */
  below: number;
  above: number;
};

/**
 * Exclusive quantile (Excel's PERCENTILE.EXC) of sorted data: position
 * p·(n + 1), clamped to [1, n], with linear interpolation.
 */
export function quantileExc(sorted: number[], p: number): Quantile {
  const n = sorted.length;
  const position = p * (n + 1);
  const clamped = Math.min(Math.max(position, 1), n);
  const lo = Math.floor(clamped);
  const below = sorted[lo - 1];
  const above = sorted[Math.min(lo, n - 1)];
  return {
    value: below + (clamped - lo) * (above - below),
    position,
    below,
    above,
  };
}

export function computeBoxPlot(values: number[]): BoxPlotStats | null {
  if (values.length < MIN_BOX_PLOT_N) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = quantileExc(sorted, 0.25);
  const medianPos = quantileExc(sorted, 0.5);
  const q3 = quantileExc(sorted, 0.75);
  const iqr = q3.value - q1.value;
  const lowerFence = q1.value - 1.5 * iqr;
  const upperFence = q3.value + 1.5 * iqr;
  const inside = sorted.filter((v) => v >= lowerFence && v <= upperFence);
  return {
    sorted,
    n,
    mean: sorted.reduce((s, v) => s + v, 0) / n,
    min: sorted[0],
    max: sorted[n - 1],
    median: medianPos.value,
    q1,
    medianPos,
    q3,
    iqr,
    lowerFence,
    upperFence,
    // `inside` always holds the values between Q1 and Q3, so it's never empty.
    whiskerLow: inside[0],
    whiskerHigh: inside[inside.length - 1],
    outliers: sorted.filter((v) => v < lowerFence || v > upperFence),
  };
}

/**
 * Parses numbers separated by commas, semicolons, spaces, tabs, or new
 * lines (e.g. pasted from a spreadsheet column). Returns the numbers plus
 * any tokens that weren't numbers.
 */
export function parseNumbers(text: string): { values: number[]; invalid: string[] } {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    if (token === "") continue;
    const v = Number(token);
    if (Number.isFinite(v)) values.push(v);
    else invalid.push(token);
  }
  return { values, invalid };
}

export type RandomShape = "normal" | "uniform" | "skewed";

function standardNormal(rand: () => number): number {
  // Box–Muller; 1 − u keeps the log argument in (0, 1].
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Random whole numbers for practice data. With `withOutliers`, a few
 * values are replaced by points far outside the bulk of the data so the
 * outlier rule has something to catch.
 */
export function generateRandomData(
  count: number,
  shape: RandomShape,
  withOutliers: boolean,
  rand: () => number = Math.random,
): number[] {
  const draw = (): number => {
    switch (shape) {
      case "normal":
        return 50 + 12 * standardNormal(rand);
      case "uniform":
        return 10 + 80 * rand();
      case "skewed":
        return 20 - 12 * Math.log(1 - rand()); // exponential, mean 32
    }
  };
  const data = Array.from({ length: count }, () => Math.round(draw()));
  const clean = computeBoxPlot(data);
  if (withOutliers && clean && count >= MIN_OUTLIER_N) {
    // Place each outlier 0.3–1.5 IQRs beyond the clean data's own fences.
    // Replacing values can shift the quartiles, so if the fence rule still
    // misses any, push them further out. (Below MIN_OUTLIER_N it can't work:
    // Q1/Q3 then interpolate halfway to the extreme values, so a planted
    // extreme drags the fence out along with it.)
    const spread = Math.max(clean.iqr, 1);
    const k = Math.max(1, Math.round(count * 0.05));
    const slots = new Set<number>();
    while (slots.size < k) slots.add(Math.floor(rand() * count));
    const offsets = [...slots].map((idx) => ({
      idx,
      high: shape === "skewed" || rand() < 0.6,
      beyond: spread * (0.3 + 1.2 * rand()),
    }));
    let fences = clean;
    for (let attempt = 0; attempt < 8; attempt++) {
      for (const o of offsets) {
        const v = data[o.idx];
        if (attempt > 0 && (v < fences.lowerFence || v > fences.upperFence)) continue;
        data[o.idx] = o.high
          ? Math.ceil(fences.upperFence + o.beyond)
          : Math.floor(fences.lowerFence - o.beyond);
      }
      fences = computeBoxPlot(data)!;
      const caught = offsets.every(
        (o) => data[o.idx] < fences.lowerFence || data[o.idx] > fences.upperFence,
      );
      if (caught) break;
    }
  }
  return data;
}
