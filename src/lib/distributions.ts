// Standard normal and Student's t-distributions: densities and exact tail
// probabilities, via the regularized incomplete gamma and beta functions
// (Numerical Recipes' series / Lentz continued fractions) — the same route
// statistical software takes, so no table lookup or interpolation.

export type Tail = "left" | "two" | "right";

function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of cof) {
    y += 1;
    ser += c / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
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
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Regularized upper incomplete gamma function Q(a, x). */
function gammq(a: number, x: number): number {
  if (x <= 0) return 1;
  const ITMAX = 200;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const lead = Math.exp(-x + a * Math.log(x) - gammaln(a));
  if (x < a + 1) {
    // Series for P(a, x), then Q = 1 - P.
    let ap = a;
    let del = 1 / a;
    let sum = del;
    for (let n = 1; n <= ITMAX; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return 1 - sum * lead;
  }
  // Continued fraction for Q(a, x).
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return lead * h;
}

/** Standard normal density at `z`. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Left-tail, right-tail, and two-tailed p-values for a z-value.
 * Two-tailed P(|Z| ≥ |z|) = Q(1/2, z²/2).
 */
export function zPValues(z: number) {
  const two = gammq(0.5, (z * z) / 2);
  // Each tail from `two` directly (not 1 − the other) so a tiny tail
  // keeps its precision instead of rounding to 1 − (almost 1).
  const small = two / 2;
  const left = z >= 0 ? 1 - small : small; // P(Z ≤ z)
  const right = z >= 0 ? small : 1 - small; // P(Z ≥ z)
  return { left, right, two };
}

/** Density of the t-distribution with `df` degrees of freedom at `t`. */
export function tPdf(t: number, df: number): number {
  const logC = gammaln((df + 1) / 2) - gammaln(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(logC - ((df + 1) / 2) * Math.log(1 + (t * t) / df));
}

/**
 * Left-tail, right-tail, and two-tailed p-values for a t-statistic.
 * Two-tailed P(|T| ≥ |t|) = I_x(df/2, 1/2) with x = df / (df + t²).
 */
export function tPValues(t: number, df: number) {
  const two = betai(df / 2, 0.5, df / (df + t * t));
  const small = two / 2;
  const left = t >= 0 ? 1 - small : small; // P(T ≤ t)
  const right = t >= 0 ? small : 1 - small; // P(T ≥ t)
  return { left, right, two };
}
