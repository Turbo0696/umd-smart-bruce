// Least-squares regression behind the Excel Simulator's LINEST. Pure math: no
// sheet or parsing concerns (those live in spreadsheet.ts).

/** One cell of LINEST's output: a number, or the error code Excel shows there. */
export type LinestCell = number | "#N/A" | "#NUM!";

/** Columns whose part orthogonal to the earlier columns is this small (relative) count as collinear. */
const COLLINEAR = 1e-10;

/**
 * Excel's LINEST. `x` holds one row per observation and one column per
 * variable. Returns 1 row (coefficients) or 5 rows (with `stats`), each
 * `x[0].length + 1` wide, coefficients in reverse variable order and the
 * intercept last, exactly as Excel lays them out. Returns null when there are
 * too few observations for the model.
 *
 * A variable that is a linear combination of the ones before it gets
 * coefficient 0 and standard error 0 and doesn't use up a degree of freedom,
 * as in Excel.
 */
export function linest(y: number[], x: number[][], constant: boolean, stats: boolean): LinestCell[][] | null {
  const n = y.length;
  const k = x[0].length;
  // Model columns: the intercept (if any) first so it is never the one dropped, then the variables.
  const p = k + (constant ? 1 : 0);
  if (n < p) return null;
  const cols: number[][] = [];
  if (constant) cols.push(new Array<number>(n).fill(1));
  for (let j = 0; j < k; j++) cols.push(x.map((row) => row[j]));

  // Modified Gram–Schmidt (applied twice per column for stability): cols = Q·R.
  const q: number[][] = [];
  const kept: number[] = []; // model-column index of each q
  const R: number[][] = cols.map(() => cols.map(() => 0));
  for (let j = 0; j < p; j++) {
    const v = cols[j].slice();
    const norm0 = Math.hypot(...v);
    for (let pass = 0; pass < 2; pass++) {
      q.forEach((qi, i) => {
        let d = 0;
        for (let t = 0; t < n; t++) d += qi[t] * v[t];
        R[kept[i]][j] += d;
        for (let t = 0; t < n; t++) v[t] -= d * qi[t];
      });
    }
    const norm = Math.hypot(...v);
    if (norm0 === 0 || norm <= COLLINEAR * norm0) continue; // collinear: dropped
    R[j][j] = norm;
    q.push(v.map((e) => e / norm));
    kept.push(j);
  }
  const r = kept.length;

  // Coefficients on the kept columns: R·beta = Qᵀy, back-substituted.
  const qty = q.map((qi) => qi.reduce((acc, e, t) => acc + e * y[t], 0));
  const beta = new Array<number>(r).fill(0);
  for (let i = r - 1; i >= 0; i--) {
    let s = qty[i];
    for (let j = i + 1; j < r; j++) s -= R[kept[i]][kept[j]] * beta[j];
    beta[i] = s / R[kept[i]][kept[i]];
  }
  const coef = new Array<number>(p).fill(0); // per model column
  kept.forEach((c, i) => (coef[c] = beta[i]));

  // Output order: variables last-to-first, then the intercept.
  const intercept = constant ? coef[0] : 0;
  const order = (f: (modelCol: number) => LinestCell, b: LinestCell): LinestCell[] => {
    const out: LinestCell[] = [];
    for (let j = k - 1; j >= 0; j--) out.push(f(constant ? j + 1 : j));
    out.push(b);
    return out;
  };
  const rows: LinestCell[][] = [order((c) => coef[c], intercept)];
  if (!stats) return rows;

  // Sums of squares.
  const fitted = y.map((_, t) => {
    let s = 0;
    cols.forEach((col, c) => (s += coef[c] * col[t]));
    return s;
  });
  const meanY = constant ? y.reduce((a, b) => a + b, 0) / n : 0;
  const ssResid = y.reduce((a, yt, t) => a + (yt - fitted[t]) ** 2, 0);
  const ssTotal = y.reduce((a, yt) => a + (yt - meanY) ** 2, 0);
  const ssReg = fitted.reduce((a, ft) => a + (ft - meanY) ** 2, 0);
  const dfResid = n - r;
  const dfModel = r - (constant ? 1 : 0);

  const NA = "#N/A";
  if (dfResid < 1) {
    // Exactly determined: nothing left to estimate errors from.
    const bad = (): LinestCell => "#NUM!";
    rows.push(order(bad, constant ? "#NUM!" : NA));
    rows.push([ssTotal === 0 ? bad() : ssReg / ssTotal, bad(), ...new Array<LinestCell>(k - 1).fill(NA)]);
    rows.push([bad(), 0, ...new Array<LinestCell>(k - 1).fill(NA)]);
    rows.push([ssReg, ssResid, ...new Array<LinestCell>(k - 1).fill(NA)]);
    return rows;
  }

  // Standard errors: sd(beta_i) = seY · sqrt(row i of R⁻¹, squared and summed).
  const seY = Math.sqrt(ssResid / dfResid);
  const rInv: number[][] = kept.map(() => new Array<number>(r).fill(0));
  for (let c = 0; c < r; c++) {
    for (let i = c; i >= 0; i--) {
      let s = i === c ? 1 : 0;
      for (let j = i + 1; j <= c; j++) s -= R[kept[i]][kept[j]] * rInv[j][c];
      rInv[i][c] = s / R[kept[i]][kept[i]];
    }
  }
  const se = new Array<number>(p).fill(0);
  kept.forEach((c, i) => {
    let s = 0;
    for (let j = i; j < r; j++) s += rInv[i][j] ** 2;
    se[c] = seY * Math.sqrt(s);
  });
  rows.push(order((c) => se[c], constant ? se[0] : NA));

  const rSquared = ssTotal === 0 ? "#NUM!" : ssReg / ssTotal;
  rows.push([rSquared, seY, ...new Array<LinestCell>(k - 1).fill(NA)]);
  const f = ssResid === 0 || dfModel < 1 ? "#NUM!" : ssReg / dfModel / (ssResid / dfResid);
  rows.push([f, dfResid, ...new Array<LinestCell>(k - 1).fill(NA)]);
  rows.push([ssReg, ssResid, ...new Array<LinestCell>(k - 1).fill(NA)]);
  return rows;
}
