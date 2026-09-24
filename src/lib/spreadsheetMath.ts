// Numerics behind the Excel Simulator's statistical functions: normal, t,
// chi-square, F, and binomial distributions plus their inverses.
//
// distributions.ts already has t and normal tails for the p-value calculator,
// but it is only good to ~10 digits, and the simulator prints 10 significant
// digits like Excel does. So this file is built for full double precision:
//
//  - The incomplete gamma and beta functions use Loader's saddle-point form of
//    their prefactors (x^a·e^-x/Γ(a), x^a·(1-x)^b/B(a,b)). Computing those from
//    three log-gamma values loses about one digit per factor of 10 in the
//    parameters, which is 10 digits for a t-distribution with a million df.
//  - Where a complement (1 - x) is needed it is passed in exactly instead of
//    being recomputed, and inverses solve for the smaller of p and 1 - p.

const HALF_LN_2PI = 0.9189385332046727; // ½·ln(2π)

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(z), Lanczos approximation (g = 7, n = 9). Accurate to ~1e-15 in absolute terms. */
export function lgamma(z: number): number {
  if (z === 0.5) return 0.5 * Math.log(Math.PI);
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return HALF_LN_2PI + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Stirling's error: ln Γ(z+1) − ln(√(2πz)·(z/e)^z). It is small (about 1/(12z)),
 * so it can be added to exactly-computed terms without cancellation.
 */
function stirlingError(z: number): number {
  if (z <= 10) return lgamma(z + 1) - (z + 0.5) * Math.log(z) + z - HALF_LN_2PI;
  const w = 1 / (z * z);
  // Bernoulli-number series: 1/12z − 1/360z³ + 1/1260z⁵ − 1/1680z⁷ + 1/1188z⁹ − 691/360360z¹¹ + 1/156z¹³
  return (
    (1 / 12 -
      w * (1 / 360 - w * (1 / 1260 - w * (1 / 1680 - w * (1 / 1188 - w * (691 / 360360 - w / 156)))))) /
    z
  );
}

/** x·ln(x/np) + np − x, computed without cancellation when x is close to np. */
function bd0(x: number, np: number): number {
  if (Math.abs(x - np) < 0.1 * (x + np)) {
    let v = (x - np) / (x + np);
    let s = (x - np) * v;
    if (Math.abs(s) < Number.MIN_VALUE) return s;
    let ej = 2 * x * v;
    v *= v;
    for (let j = 1; j < 1000; j++) {
      ej *= v;
      const next = s + ej / (2 * j + 1);
      if (next === s) return next;
      s = next;
    }
  }
  return x * Math.log(x / np) + np - x;
}

/**
 * C(k + m, k)·p^k·q^m for real k, m ≥ 0 with q = 1 − p, i.e. a binomial
 * probability, via Loader's saddle-point formula (accurate to ~1e-15 for any size).
 */
function binomialTerm(k: number, m: number, p: number, q: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (q === 0) return m === 0 ? 1 : 0;
  const n = k + m;
  // ln p and ln q from whichever of p, q is the exact small one.
  if (k === 0) return Math.exp(m * (p < 0.5 ? Math.log1p(-p) : Math.log(q)));
  if (m === 0) return Math.exp(k * (q < 0.5 ? Math.log1p(-q) : Math.log(p)));
  const lc = stirlingError(n) - stirlingError(k) - stirlingError(m) - bd0(k, n * p) - bd0(m, n * q);
  return Math.exp(lc) * Math.sqrt(n / (2 * Math.PI * k * m));
}

/** x^a·(1−x)^b / B(a, b), given y = 1 − x. */
function betaPrefactor(x: number, y: number, a: number, b: number): number {
  return ((a * b) / (a + b)) * binomialTerm(a, b, x, y);
}

/** x^a·e^−x / Γ(a) for x > 0. */
function gammaPrefactor(a: number, x: number): number {
  return (a * Math.exp(-stirlingError(a) - bd0(a, x))) / Math.sqrt(2 * Math.PI * a);
}

/** ln[Γ(a + ½)/Γ(a)], which the t density needs; direct for small a, Stirling for large. */
function lnGammaRatioHalf(a: number): number {
  if (a < 10) return lgamma(a + 0.5) - lgamma(a);
  return 0.5 * Math.log(a) + a * Math.log1p(0.5 / a) - 0.5 + stirlingError(a + 0.5) - stirlingError(a);
}

/* ---------- normal ---------- */

/** Standard normal CDF Φ(x), from the incomplete gamma function: Φ(-|x|) = ½·Q(½, x²/2). */
export function normalCdf(x: number): number {
  const tail = 0.5 * gammaQ(0.5, (x * x) / 2);
  return x > 0 ? 1 - tail : tail;
}

// Acklam's rational approximation of the lower-half quantile (relative error ~1e-9),
// which normalInv then polishes to full precision.
const ACKLAM_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const ACKLAM_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const ACKLAM_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACKLAM_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

function normalInvApprox(p: number): number {
  const [a, b, c, d] = [ACKLAM_A, ACKLAM_B, ACKLAM_C, ACKLAM_D];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/**
 * Standard normal quantile. Works on the lower half only (the upper half is
 * its mirror image, and 1 − p is exact for p ≥ ½), then polishes Acklam's
 * estimate with Halley steps on a residual computed without cancellation, so
 * results are accurate to ~1e-15 relative even in the far tails and right next
 * to the median.
 */
export function normalInv(p: number): number {
  if (p > 0.5) return -normalInv(1 - p);
  if (p === 0.5) return 0;
  let x = normalInvApprox(p);
  for (let i = 0; i < 2; i++) {
    const half = (x * x) / 2;
    // Φ(x) − p, as (½ − p) − ½·P near the middle and ½·Q − p in the tail.
    const e = p >= 0.25 ? 0.5 - p - 0.5 * gammaP(0.5, half) : 0.5 * gammaQ(0.5, half) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(half);
    if (!Number.isFinite(u)) break;
    x -= u / (1 + (x * u) / 2);
  }
  return x;
}

/* ---------- incomplete beta ---------- */

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
  // Converges in O(√max(a, b)) steps, so a million degrees of freedom needs thousands.
  for (let m = 1; m <= 100000; m++) {
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

/**
 * Regularized incomplete beta function I_x(a, b). Pass `y = 1 − x` when the
 * caller can compute it exactly, so an x near 1 doesn't lose the digits of y.
 */
export function ibeta(x: number, a: number, b: number, y: number = 1 - x): number {
  if (x <= 0) return 0;
  if (y <= 0) return 1;
  const bt = betaPrefactor(x, y, a, b);
  if (x < (a + 1) / (a + b + 2)) {
    // With a huge and b small (a t or F distribution with many degrees of freedom) the direct
    // continued fraction loses about a·1e-16 when x is near 1, while the reflected form 1 − J
    // loses about 1e-16 / result. Take whichever is better: the reflected form unless the
    // result is smaller than 1/(a+b). (With both parameters large the reflected fraction is
    // not stable, so this is only for a small b.)
    if (a > 1e5 && b < 100 && x > 0.5) {
      const reflected = 1 - (bt * betaCf(b, a, y)) / b;
      if (reflected * (a + b) > 1) return reflected;
    }
    return (bt * betaCf(a, b, x)) / a;
  }
  return 1 - (bt * betaCf(b, a, y)) / b;
}

/* ---------- Student's t ---------- */

/** Two-tailed P(|T| ≥ |t|). */
export function tTwoTail(t: number, df: number): number {
  const t2 = t * t;
  if (!Number.isFinite(t2)) return 0;
  return ibeta(df / (df + t2), df / 2, 0.5, t2 / (df + t2));
}

/** P(|T| < t): the central mass, accurate for small t where 1 − tTwoTail would cancel. */
export function tCentral(t: number, df: number): number {
  const t2 = t * t;
  if (!Number.isFinite(t2)) return 1;
  return ibeta(t2 / (df + t2), 0.5, df / 2, df / (df + t2));
}

/** P(T ≤ t). Uses the central mass near 0 and the tail elsewhere, so neither half cancels. */
export function tCdf(t: number, df: number): number {
  if (Math.abs(t) < 1) {
    const half = 0.5 * tCentral(Math.abs(t), df);
    return t >= 0 ? 0.5 + half : 0.5 - half;
  }
  const tail = 0.5 * tTwoTail(t, df);
  return t > 0 ? 1 - tail : tail;
}

export function tPdf(t: number, df: number): number {
  return (
    (Math.exp(lnGammaRatioHalf(df / 2)) / Math.sqrt(df * Math.PI)) *
    Math.exp((-(df + 1) / 2) * Math.log1p((t * t) / df))
  );
}

/* ---------- incomplete gamma ---------- */

function gammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 200000; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-16) break;
  }
  return sum * gammaPrefactor(a, x);
}

function gammaCf(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200000; i++) {
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
  return gammaPrefactor(a, x) * h;
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaCf(a, x);
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaCf(a, x);
}

/* ---------- inverses ---------- */

/**
 * The x > 0 where a monotone function `f` crosses `target`. Brackets the root,
 * then bisects geometrically, so a root of 1e-200 is found as precisely (in
 * relative terms) as one of 200. Returns 0 if the root is below the smallest
 * double, and NaN if it lies beyond `maxX`.
 */
export function solveMonotone(
  f: (x: number) => number,
  target: number,
  increasing: boolean,
  maxX = Number.MAX_VALUE,
): number {
  const rootAbove = (x: number) => (increasing ? f(x) < target : f(x) > target);
  let lo = 1;
  let hi = 1;
  if (rootAbove(1)) {
    do {
      lo = hi;
      hi *= 2;
      if (hi > maxX) return NaN;
    } while (rootAbove(hi));
  } else {
    do {
      hi = lo;
      lo /= 2;
      if (lo < 1e-320) return 0;
    } while (!rootAbove(lo));
  }
  for (let i = 0; i < 400 && hi - lo > 2.2e-16 * hi; i++) {
    const mid = Math.sqrt(lo) * Math.sqrt(hi);
    if (rootAbove(mid)) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo) * Math.sqrt(hi);
}

/* ---------- chi-square, F, binomial ---------- */

export const chiSqCdf = (x: number, df: number) => gammaP(df / 2, x / 2);
export const chiSqRightTail = (x: number, df: number) => gammaQ(df / 2, x / 2);

export function chiSqPdf(x: number, df: number): number {
  if (x === 0) return df === 2 ? 0.5 : df < 2 ? Infinity : 0;
  return gammaPrefactor(df / 2, x / 2) / x;
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const num = d1 * x;
  if (!Number.isFinite(num)) return 1;
  return ibeta(num / (num + d2), d1 / 2, d2 / 2, d2 / (num + d2));
}

export function fRightTail(x: number, d1: number, d2: number): number {
  if (x <= 0) return 1;
  const num = d1 * x;
  if (!Number.isFinite(num)) return 0;
  return ibeta(d2 / (num + d2), d2 / 2, d1 / 2, num / (num + d2));
}

export function fPdf(x: number, d1: number, d2: number): number {
  if (x === 0) return d1 === 2 ? 1 : d1 < 2 ? Infinity : 0;
  const num = d1 * x;
  return betaPrefactor(num / (num + d2), d2 / (num + d2), d1 / 2, d2 / 2) / x;
}

export function binomPmf(k: number, n: number, p: number): number {
  return binomialTerm(k, n - k, p, 1 - p);
}

export function binomCdf(k: number, n: number, p: number): number {
  if (k >= n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  return ibeta(1 - p, n - k, k + 1, p);
}

/** P(X > k) for a binomial, accurate even when it is tiny. */
export function binomSf(k: number, n: number, p: number): number {
  if (k >= n) return 0;
  if (p === 0) return 0;
  if (p === 1) return 1;
  return ibeta(p, k + 1, n - k, 1 - p);
}
