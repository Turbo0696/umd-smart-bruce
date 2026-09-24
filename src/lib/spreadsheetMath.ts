// Numerics behind the Excel Simulator's statistical functions: normal, t,
// chi-square, F, and binomial distributions plus their inverses.
//
// distributions.ts already has t and normal tails for the p-value calculator,
// but its log-gamma is only good to ~10 digits. The simulator prints 10
// significant digits like Excel does, so this file uses a Lanczos log-gamma
// (~15 digits) and iterates the continued fractions to machine precision.

/** Standard normal CDF, Hart / West double-precision algorithm. */
export function normalCdf(x: number): number {
  const xa = Math.abs(x);
  let c: number;
  if (xa > 37) {
    c = 0;
  } else {
    const e = Math.exp((-xa * xa) / 2);
    if (xa < 7.07106781186547) {
      let b = 3.52624965998911e-2 * xa + 0.700383064443688;
      b = b * xa + 6.37396220353165;
      b = b * xa + 33.912866078383;
      b = b * xa + 112.079291497871;
      b = b * xa + 221.213596169931;
      b = b * xa + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * xa + 1.75566716318264;
      b = b * xa + 16.064177579207;
      b = b * xa + 86.7807322029461;
      b = b * xa + 296.564248779674;
      b = b * xa + 637.333633378831;
      b = b * xa + 793.826512519948;
      b = b * xa + 440.413735824752;
      c = c / b;
    } else {
      let b = xa + 0.65;
      b = xa + 4 / b;
      b = xa + 3 / b;
      b = xa + 2 / b;
      b = xa + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Standard normal quantile: Acklam's approximation plus one Halley step. */
export function normalInv(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(z), Lanczos approximation (g = 7, n = 9). */
export function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const FPMIN = 1e-300;

function betaCf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betaCf(a, b, x)) / a
    : 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

/** Two-tailed P(|T| ≥ |t|) for Student's t. */
export function tTwoTail(t: number, df: number): number {
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

/** One-tailed P(T > |t|). */
export function tTail(t: number, df: number): number {
  return 0.5 * tTwoTail(t, df);
}

export function tCdf(t: number, df: number): number {
  return t >= 0 ? 1 - tTail(t, df) : tTail(t, df);
}

export function tPdf(t: number, df: number): number {
  return (
    (Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI)) *
    Math.pow(1 + (t * t) / df, -(df + 1) / 2)
  );
}

/** The t > 0 with P(T > t) = q. */
export function tUpperInv(q: number, df: number): number {
  let hi = 1;
  let i = 0;
  while (tTail(hi, df) > q && i++ < 1100) hi *= 2;
  let lo = 0;
  for (i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (tTail(mid, df) > q) lo = mid;
    else hi = mid;
    if (hi - lo <= 1e-15 * hi) break;
  }
  return (lo + hi) / 2;
}

function gammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 2000; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-16) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

function gammaCf(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/** Regularized lower incomplete gamma P(a, x). */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaCf(a, x);
}

/** Regularized upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaCf(a, x);
}

/**
 * Bisection for the x ≥ 0 where a monotone `f` crosses `target`. `increasing`
 * says which way `f` runs; the bracket is doubled until it contains the root.
 */
export function solveMonotone(
  f: (x: number) => number,
  target: number,
  increasing: boolean,
): number {
  let hi = 1;
  let lo = 0;
  let i = 0;
  while ((increasing ? f(hi) < target : f(hi) > target) && i++ < 2000) hi *= 2;
  for (i = 0; i < 400; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < target) === increasing) lo = mid;
    else hi = mid;
    if (hi - lo <= 1e-15 * hi) break;
  }
  return (lo + hi) / 2;
}

export const chiSqCdf = (x: number, df: number) => gammaP(df / 2, x / 2);
export const chiSqRightTail = (x: number, df: number) => gammaQ(df / 2, x / 2);

export function chiSqPdf(x: number, df: number): number {
  if (x === 0) return df === 2 ? 0.5 : df < 2 ? Infinity : 0;
  return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.LN2 - lgamma(df / 2));
}

export const fCdf = (x: number, d1: number, d2: number) =>
  x <= 0 ? 0 : ibeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
export const fRightTail = (x: number, d1: number, d2: number) =>
  x <= 0 ? 1 : ibeta(d2 / (d2 + d1 * x), d2 / 2, d1 / 2);

export function fPdf(x: number, d1: number, d2: number): number {
  if (x === 0) return d1 === 2 ? 1 : d1 < 2 ? Infinity : 0;
  return Math.exp(
    lgamma((d1 + d2) / 2) -
      lgamma(d1 / 2) -
      lgamma(d2 / 2) +
      (d1 / 2) * Math.log(d1 / d2) +
      (d1 / 2 - 1) * Math.log(x) -
      ((d1 + d2) / 2) * Math.log(1 + (d1 * x) / d2),
  );
}

export function binomPmf(k: number, n: number, p: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(
    lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p),
  );
}

export function binomCdf(k: number, n: number, p: number): number {
  if (k >= n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  return ibeta(1 - p, n - k, k + 1);
}
