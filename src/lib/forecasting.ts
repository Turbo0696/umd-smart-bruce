export type ForecastMethod =
  | "SMA3"
  | "SMA4"
  | "WMA"
  | "EXP_SMOOTHING"
  | "LINEAR_REGRESSION";

export const METHOD_ORDER: ForecastMethod[] = [
  "SMA3",
  "SMA4",
  "WMA",
  "EXP_SMOOTHING",
  "LINEAR_REGRESSION",
];

export const METHOD_LABELS: Record<ForecastMethod, string> = {
  SMA3: "3-Period Simple Moving Average",
  SMA4: "4-Period Simple Moving Average",
  WMA: "Weighted Moving Average",
  EXP_SMOOTHING: "Exponential Smoothing",
  LINEAR_REGRESSION: "Linear Regression Trend",
};

export const METHOD_HINTS: Record<ForecastMethod, string> = {
  SMA3: "Average the last 3 periods. Smooths noise but reacts slowly to trends.",
  SMA4: "Average the last 4 periods. Even smoother, even slower to react.",
  WMA: "Average the last 3 periods, weighting the most recent one heaviest (weights: 0.5 / 0.3 / 0.2, most recent first).",
  EXP_SMOOTHING: "Blend each period's actual value with the prior forecast (α = 0.3), carried forward from the very first period.",
  LINEAR_REGRESSION: "Fit a straight trend line through all the data and project it one period ahead.",
};

const WMA_WEIGHTS = [0.5, 0.3, 0.2]; // most recent first, sums to 1
const EXP_ALPHA = 0.3;

export function simpleMovingAverage(data: number[], n: number): number {
  const window = data.slice(-n);
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

export function weightedMovingAverage(
  data: number[],
  weights: number[] = WMA_WEIGHTS,
): number {
  const window = data.slice(-weights.length).reverse(); // most recent first
  return window.reduce((sum, v, i) => sum + v * weights[i], 0);
}

// F(t+1) = alpha*A(t) + (1-alpha)*F(t), seeded with the first actual value.
export function exponentialSmoothing(
  data: number[],
  alpha: number = EXP_ALPHA,
): number {
  let forecast = data[0];
  for (let t = 0; t < data.length; t++) {
    forecast = alpha * data[t] + (1 - alpha) * forecast;
  }
  return forecast;
}

// Least-squares fit over period index (1-based), forecast the next period.
export function linearRegressionForecast(data: number[]): number {
  const n = data.length;
  const xs = data.map((_, i) => i + 1);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = data.reduce((s, y) => s + y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (data[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  return intercept + slope * (n + 1);
}

export function computeForecast(method: ForecastMethod, data: number[]): number {
  switch (method) {
    case "SMA3":
      return simpleMovingAverage(data, 3);
    case "SMA4":
      return simpleMovingAverage(data, 4);
    case "WMA":
      return weightedMovingAverage(data);
    case "EXP_SMOOTHING":
      return exponentialSmoothing(data);
    case "LINEAR_REGRESSION":
      return linearRegressionForecast(data);
  }
}

export function percentError(userForecast: number, correct: number): number {
  return Math.abs(userForecast - correct) / Math.abs(correct) * 100;
}

export function scoreFor(pctError: number): number {
  if (pctError <= 5) return 100;
  if (pctError <= 10) return 75;
  if (pctError <= 20) return 50;
  if (pctError <= 35) return 25;
  return 0;
}

// A short, human-readable explanation of how the correct answer was
// derived — shown to the student after they submit.
export function explain(method: ForecastMethod, data: number[]): string {
  const n = data.length;
  switch (method) {
    case "SMA3": {
      const w = data.slice(-3);
      return `Average of the last 3 periods: (${w.join(" + ")}) / 3 = ${simpleMovingAverage(data, 3).toFixed(2)}`;
    }
    case "SMA4": {
      const w = data.slice(-4);
      return `Average of the last 4 periods: (${w.join(" + ")}) / 4 = ${simpleMovingAverage(data, 4).toFixed(2)}`;
    }
    case "WMA": {
      const w = data.slice(-WMA_WEIGHTS.length).reverse();
      const terms = w.map((v, i) => `${WMA_WEIGHTS[i]}×${v}`).join(" + ");
      return `Weighted average (weights ${WMA_WEIGHTS.join("/")} on the most recent periods): ${terms} = ${weightedMovingAverage(data).toFixed(2)}`;
    }
    case "EXP_SMOOTHING":
      return `Exponential smoothing with α = ${EXP_ALPHA}: each period's forecast blends ${EXP_ALPHA * 100}% of the actual with ${(1 - EXP_ALPHA) * 100}% of the prior forecast, carried forward through all ${n} periods = ${exponentialSmoothing(data).toFixed(2)}`;
    case "LINEAR_REGRESSION":
      return `Least-squares trend line fit through all ${n} periods, projected one period ahead = ${linearRegressionForecast(data).toFixed(2)}`;
  }
}
