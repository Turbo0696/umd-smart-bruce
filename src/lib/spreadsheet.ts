// Formula engine for the Excel Simulator: a 10 × 10 sheet (A1:J10) with
// Excel-style statistical functions. Pure functions only — the UI state lives
// in spreadsheetState.ts.

import {
  binomCdf,
  binomPmf,
  chiSqCdf,
  chiSqPdf,
  chiSqRightTail,
  fCdf,
  fPdf,
  fRightTail,
  normalCdf,
  normalInv,
  solveMonotone,
  tCdf,
  tPdf,
  tTail,
  tTwoTail,
  tUpperInv,
} from "@/lib/spreadsheetMath";

export const COLS = "ABCDEFGHIJ";
export const N = 10;

/** Raw cell contents by key ("A1"…"J10"). Empty cells are absent. */
export type Cells = Record<string, string>;

export interface Rect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export type FillDir = "u" | "d" | "l" | "r";

export function cellKey(c: number, r: number): string {
  return COLS[c] + (r + 1);
}

/** [col, row] (zero-based) for a key like "B3". */
export function parseKey(k: string): [number, number] {
  return [COLS.indexOf(k[0]), Number(k.slice(1)) - 1];
}

const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

export function isNumeric(s: string): boolean {
  return NUMERIC.test(s);
}

/** Returns a copy of `cells` with `k` set (or removed when `v` is empty). */
export function withCell(cells: Cells, k: string, v: string): Cells {
  const out = { ...cells };
  if (v === "") delete out[k];
  else out[k] = v;
  return out;
}

/* ---------- functions ---------- */

/** A spreadsheet error; `message` is the code shown in the cell ("#DIV/0!"). */
export class SheetError extends Error {}

const fail = (code: string): never => {
  throw new SheetError(code);
};

/** A function argument: a number, a text cell, or a range of them. */
type Arg = number | string | Arg[];
type Fn = (...a: Arg[]) => number;

function flat(a: Arg[]): number[] {
  const out: number[] = [];
  const walk = (x: Arg[]) => {
    for (const v of x) {
      if (Array.isArray(v)) walk(v);
      else if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  };
  walk(a);
  return out;
}

function S(x: Arg | undefined): number {
  if (typeof x !== "number" || Number.isNaN(x)) return fail("#VALUE!");
  return x;
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const mean = (v: number[]) => sum(v) / v.length;

function variance(v: number[], sample: boolean): number {
  const n = v.length;
  if (n < (sample ? 2 : 1)) fail("#DIV/0!");
  const m = mean(v);
  return sum(v.map((x) => (x - m) * (x - m))) / (sample ? n - 1 : n);
}

/** Whole-number degrees of freedom ≥ 1, truncated like Excel. */
function df(d: Arg | undefined): number {
  const n = Math.floor(S(d));
  if (n < 1) fail("#NUM!");
  return n;
}

const FUNCTIONS: Record<string, Fn> = {
  SUM: (...a) => sum(flat(a)),
  AVERAGE: (...a) => {
    const v = flat(a);
    if (!v.length) fail("#DIV/0!");
    return mean(v);
  },
  MIN: (...a) => {
    const v = flat(a);
    return v.length ? Math.min(...v) : 0;
  },
  MAX: (...a) => {
    const v = flat(a);
    return v.length ? Math.max(...v) : 0;
  },
  COUNT: (...a) => flat(a).length,
  MEDIAN: (...a) => {
    const v = flat(a).sort((x, y) => x - y);
    const n = v.length;
    if (!n) fail("#NUM!");
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  },
  "STDEV.S": (...a) => Math.sqrt(variance(flat(a), true)),
  "STDEV.P": (...a) => Math.sqrt(variance(flat(a), false)),
  "VAR.S": (...a) => variance(flat(a), true),
  "VAR.P": (...a) => variance(flat(a), false),
  CORREL: (a, b) => {
    const x = flat([a]);
    const y = flat([b]);
    if (x.length !== y.length || x.length < 2) fail("#N/A");
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) * (x[i] - mx);
      syy += (y[i] - my) * (y[i] - my);
    }
    if (!sxx || !syy) fail("#DIV/0!");
    return sxy / Math.sqrt(sxx * syy);
  },
  SQRT: (x) => {
    const v = S(x);
    if (v < 0) fail("#NUM!");
    return Math.sqrt(v);
  },
  ABS: (x) => Math.abs(S(x)),
  LN: (x) => {
    const v = S(x);
    if (v <= 0) fail("#NUM!");
    return Math.log(v);
  },
  EXP: (x) => Math.exp(S(x)),
  POWER: (x, y) => Math.pow(S(x), S(y)),
  ROUND: (x, d) => {
    const k = Math.pow(10, S(d === undefined ? 0 : d));
    return Math.round(S(x) * k) / k;
  },

  "NORM.S.DIST": (z, cum) => {
    const v = S(z);
    return S(cum) ? normalCdf(v) : Math.exp((-v * v) / 2) / Math.sqrt(2 * Math.PI);
  },
  "NORM.S.INV": (p) => {
    const v = S(p);
    if (v <= 0 || v >= 1) fail("#NUM!");
    return normalInv(v);
  },
  "NORM.DIST": (x, m, sd, cum) => {
    const xv = S(x);
    const mu = S(m);
    const s = S(sd);
    if (s <= 0) fail("#NUM!");
    const z = (xv - mu) / s;
    return S(cum) ? normalCdf(z) : Math.exp((-z * z) / 2) / (s * Math.sqrt(2 * Math.PI));
  },
  "NORM.INV": (p, m, sd) => {
    const pv = S(p);
    const mu = S(m);
    const s = S(sd);
    if (pv <= 0 || pv >= 1 || s <= 0) fail("#NUM!");
    return mu + s * normalInv(pv);
  },

  "T.DIST": (x, d, cum) => {
    const t = S(x);
    const n = df(d);
    return S(cum) ? tCdf(t, n) : tPdf(t, n);
  },
  "T.DIST.2T": (x, d) => {
    const t = S(x);
    const n = df(d);
    if (t < 0) fail("#NUM!");
    return tTwoTail(t, n);
  },
  "T.DIST.RT": (x, d) => {
    const t = S(x);
    const n = df(d);
    return t >= 0 ? tTail(t, n) : 1 - tTail(t, n);
  },
  "T.INV": (p, d) => {
    const pv = S(p);
    const n = df(d);
    if (pv <= 0 || pv >= 1) fail("#NUM!");
    if (pv === 0.5) return 0;
    const t = tUpperInv(Math.min(pv, 1 - pv), n);
    return pv < 0.5 ? -t : t;
  },
  "T.INV.2T": (p, d) => {
    const pv = S(p);
    const n = df(d);
    if (pv <= 0 || pv > 1) fail("#NUM!");
    if (pv === 1) return 0;
    return tUpperInv(pv / 2, n);
  },

  "CHISQ.DIST": (x, d, cum) => {
    const v = S(x);
    const n = df(d);
    if (v < 0) fail("#NUM!");
    return S(cum) ? chiSqCdf(v, n) : chiSqPdf(v, n);
  },
  "CHISQ.DIST.RT": (x, d) => {
    const v = S(x);
    const n = df(d);
    if (v < 0) fail("#NUM!");
    return chiSqRightTail(v, n);
  },
  "CHISQ.INV": (p, d) => {
    const pv = S(p);
    const n = df(d);
    if (pv < 0 || pv >= 1) fail("#NUM!");
    if (pv === 0) return 0;
    return solveMonotone((x) => chiSqCdf(x, n), pv, true);
  },
  "CHISQ.INV.RT": (p, d) => {
    const pv = S(p);
    const n = df(d);
    if (pv <= 0 || pv > 1) fail("#NUM!");
    if (pv === 1) return 0;
    return solveMonotone((x) => chiSqRightTail(x, n), pv, false);
  },

  "F.DIST": (x, a, b, cum) => {
    const v = S(x);
    const d1 = df(a);
    const d2 = df(b);
    if (v < 0) fail("#NUM!");
    return S(cum) ? fCdf(v, d1, d2) : fPdf(v, d1, d2);
  },
  "F.DIST.RT": (x, a, b) => {
    const v = S(x);
    const d1 = df(a);
    const d2 = df(b);
    if (v < 0) fail("#NUM!");
    return fRightTail(v, d1, d2);
  },
  "F.INV": (p, a, b) => {
    const pv = S(p);
    const d1 = df(a);
    const d2 = df(b);
    if (pv < 0 || pv >= 1) fail("#NUM!");
    if (pv === 0) return 0;
    return solveMonotone((x) => fCdf(x, d1, d2), pv, true);
  },
  "F.INV.RT": (p, a, b) => {
    const pv = S(p);
    const d1 = df(a);
    const d2 = df(b);
    if (pv <= 0 || pv > 1) fail("#NUM!");
    if (pv === 1) return 0;
    return solveMonotone((x) => fRightTail(x, d1, d2), pv, false);
  },

  "BINOM.DIST": (k, n, p, cum) => {
    const kv = Math.floor(S(k));
    const nv = Math.floor(S(n));
    const pv = S(p);
    if (kv < 0 || nv < 0 || kv > nv || pv < 0 || pv > 1) fail("#NUM!");
    return S(cum) ? binomCdf(kv, nv, pv) : binomPmf(kv, nv, pv);
  },
  "BINOM.INV": (n, p, alpha) => {
    const nv = Math.floor(S(n));
    const pv = S(p);
    const a = S(alpha);
    if (nv < 0 || pv < 0 || pv > 1 || a < 0 || a > 1) fail("#NUM!");
    for (let k = 0; k <= nv; k++) if (binomCdf(k, nv, pv) >= a - 1e-12) return k;
    return nv;
  },
};

// Older names Excel still accepts.
FUNCTIONS.STDEV = FUNCTIONS["STDEV.S"];
FUNCTIONS.VAR = FUNCTIONS["VAR.S"];

/** Function names by group, for the on-page reference. */
export const FUNCTION_GROUPS: { label: string; names: string[] }[] = [
  {
    label: "Math",
    names: [
      "SUM", "AVERAGE", "MIN", "MAX", "COUNT", "MEDIAN", "STDEV.S", "STDEV.P",
      "VAR.S", "VAR.P", "CORREL", "SQRT", "ABS", "ROUND", "LN", "EXP", "POWER",
    ],
  },
  {
    label: "Normal & t",
    names: [
      "NORM.DIST", "NORM.INV", "NORM.S.DIST", "NORM.S.INV", "T.DIST", "T.DIST.2T",
      "T.DIST.RT", "T.INV", "T.INV.2T",
    ],
  },
  {
    label: "Chi-square, F & binomial",
    names: [
      "CHISQ.DIST", "CHISQ.DIST.RT", "CHISQ.INV", "CHISQ.INV.RT", "F.DIST",
      "F.DIST.RT", "F.INV", "F.INV.RT", "BINOM.DIST", "BINOM.INV",
    ],
  },
];

/* ---------- parsing ---------- */

type Token =
  | { t: "num"; v: number }
  | { t: "word"; v: string }
  | { t: "op"; v: string };

const NUM_RE = /^(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?/;
const WORD_RE = /^[$A-Z_][$A-Z0-9_.]*/;
const CELL_RE = /^\$?([A-J])\$?(10|[1-9])$/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = rest[0];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = NUM_RE.exec(rest);
    if (num) {
      out.push({ t: "num", v: parseFloat(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = WORD_RE.exec(rest);
    if (word) {
      out.push({ t: "word", v: word[0] });
      i += word[0].length;
      continue;
    }
    if ("+-*/(),:".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    return fail("#NAME?");
  }
  return out;
}

/** Looks up a cell's value: "" (empty), a number, or its text. */
type Lookup = (k: string) => number | string;

/**
 * Evaluates one formula (without the leading "="). Grammar:
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/") unary)*
 *   unary   := ("+" | "-") unary | primary
 *   primary := number | "(" expr ")" | NAME "(" [arg ("," arg)*] ")"
 *            | cell | TRUE | FALSE
 *   arg     := cell ":" cell | expr
 * A range is only valid as a function argument.
 */
function evalFormula(formula: string, lookup: Lookup): number {
  const upper = formula.toUpperCase();
  if (upper.includes("#REF!")) fail("#REF!");
  const toks = tokenize(upper);
  let pos = 0;

  const isOp = (v: string) => {
    const t = toks[pos];
    return t !== undefined && t.t === "op" && t.v === v;
  };
  const eat = (v: string) => {
    if (!isOp(v)) fail("#ERR!");
    pos++;
  };

  const cellValue = (word: string): number => {
    const m = CELL_RE.exec(word);
    if (!m) return fail("#NAME?");
    const v = lookup(m[1] + m[2]);
    if (v === "") return 0;
    if (typeof v !== "number") return fail("#VALUE!");
    return v;
  };

  const range = (a: string, b: string): Arg[] => {
    const m1 = CELL_RE.exec(a);
    const m2 = CELL_RE.exec(b);
    if (!m1 || !m2) return fail("#NAME?");
    const c1 = COLS.indexOf(m1[1]);
    const c2 = COLS.indexOf(m2[1]);
    const r1 = Number(m1[2]);
    const r2 = Number(m2[2]);
    const out: Arg[] = [];
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        const v = lookup(COLS[c] + r);
        if (v !== "") out.push(v);
      }
    }
    return out;
  };

  const arg = (): Arg => {
    const t = toks[pos];
    const colon = toks[pos + 1];
    const end = toks[pos + 2];
    if (
      t?.t === "word" &&
      CELL_RE.test(t.v) &&
      colon?.t === "op" &&
      colon.v === ":" &&
      end?.t === "word"
    ) {
      pos += 3;
      return range(t.v, end.v);
    }
    return expr();
  };

  const primary = (): number => {
    const t = toks[pos++];
    if (!t) return fail("#ERR!");
    if (t.t === "num") return t.v;
    if (t.t === "op") {
      if (t.v !== "(") return fail("#ERR!");
      const v = expr();
      eat(")");
      return v;
    }
    if (isOp("(")) {
      pos++;
      const fn = FUNCTIONS[t.v];
      if (!fn) return fail("#NAME?");
      const args: Arg[] = [];
      if (!isOp(")")) {
        args.push(arg());
        while (isOp(",")) {
          pos++;
          args.push(arg());
        }
      }
      eat(")");
      return fn(...args);
    }
    if (t.v === "TRUE") return 1;
    if (t.v === "FALSE") return 0;
    return cellValue(t.v);
  };

  const unary = (): number => {
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return primary();
  };

  const term = (): number => {
    let v = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[pos++] as { v: string }).v;
      const rhs = unary();
      if (op === "*") v *= rhs;
      else if (rhs === 0) return fail("#DIV/0!");
      else v /= rhs;
    }
    return v;
  };

  const expr = (): number => {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[pos++] as { v: string }).v;
      const rhs = term();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  };

  const result = expr();
  // A leftover ":" is a bare range (=A1:B2), which can't be a single value.
  if (pos < toks.length) fail(isOp(":") ? "#VALUE!" : "#ERR!");
  if (!Number.isFinite(result)) return fail(Number.isNaN(result) ? "#VALUE!" : "#DIV/0!");
  return result;
}

/* ---------- whole-sheet evaluation ---------- */

export interface CellResult {
  /** What the cell shows. */
  text: string;
  kind: "empty" | "number" | "text" | "error";
  /** Numeric value, for the selection summary. Null for text and errors. */
  num: number | null;
}

/** 10 significant digits, like Excel's General format. */
export function formatNumber(v: number): string {
  return String(parseFloat(v.toPrecision(10)));
}

/** Evaluates every cell once, sharing results between dependents. */
export function evaluateSheet(cells: Cells): Record<string, CellResult> {
  const memo = new Map<string, { v: number | string } | { err: SheetError }>();
  const inProgress = new Set<string>();

  function value(k: string): number | string {
    const raw = cells[k];
    if (raw === undefined || raw === "") return "";
    if (raw[0] !== "=") return isNumeric(raw) ? parseFloat(raw) : raw;
    const hit = memo.get(k);
    if (hit) {
      if ("err" in hit) throw hit.err;
      return hit.v;
    }
    if (inProgress.has(k)) return fail("#CIRC!");
    inProgress.add(k);
    try {
      const v = evalFormula(raw.slice(1), value);
      memo.set(k, { v });
      return v;
    } catch (e) {
      const err = e instanceof SheetError ? e : new SheetError("#ERR!");
      memo.set(k, { err });
      throw err;
    } finally {
      inProgress.delete(k);
    }
  }

  const out: Record<string, CellResult> = {};
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const k = cellKey(c, r);
      try {
        const v = value(k);
        if (v === "") out[k] = { text: "", kind: "empty", num: null };
        else if (typeof v === "number") out[k] = { text: formatNumber(v), kind: "number", num: v };
        else out[k] = { text: v, kind: "text", num: null };
      } catch (e) {
        const text = e instanceof SheetError && e.message.startsWith("#") ? e.message : "#ERR!";
        out[k] = { text, kind: "error", num: null };
      }
    }
  }
  return out;
}

/* ---------- copy / fill / F4 helpers ---------- */

const REF_IN_FORMULA = /(^|[^A-Za-z0-9_.$])(\$?)([A-J])(\$?)(10|[1-9])(?![A-Za-z0-9_.])/gi;

/**
 * Moves the relative references in a formula by (dc, dr), the way copying a
 * formula does. References pushed off the sheet become #REF!.
 */
export function shiftFormula(f: string, dc: number, dr: number): string {
  return f.replace(REF_IN_FORMULA, (_m, pre: string, d1: string, a: string, d2: string, b: string) => {
    let c = COLS.indexOf(a.toUpperCase());
    let r = Number(b);
    if (!d1) c += dc;
    if (!d2) r += dr;
    if (c < 0 || c >= N || r < 1 || r > N) return pre + "#REF!";
    return pre + d1 + COLS[c] + d2 + r;
  });
}

/**
 * Fills `n` cells past `src` in direction `dir` (the drag-handle fill). A run
 * of two or more numbers continues as a series; anything else repeats, with
 * formulas' relative references shifted.
 */
export function fillRange(cells: Cells, src: Rect, dir: FillDir, n: number): Cells {
  const out = { ...cells };
  const vert = dir === "d" || dir === "u";
  const fwd = dir === "d" || dir === "r";
  const len = vert ? src.r1 - src.r0 + 1 : src.c1 - src.c0 + 1;
  const lines = vert ? src.c1 - src.c0 + 1 : src.r1 - src.r0 + 1;
  for (let line = 0; line < lines; line++) {
    const arr: { c: number; r: number; v: string }[] = [];
    let nums = true;
    for (let i = 0; i < len; i++) {
      const c = vert ? src.c0 + line : src.c0 + i;
      const r = vert ? src.r0 + i : src.r0 + line;
      const v = cells[cellKey(c, r)] ?? "";
      if (v === "" || v[0] === "=" || !isNumeric(v)) nums = false;
      arr.push({ c, r, v });
    }
    const step =
      len >= 2 && nums ? (parseFloat(arr[len - 1].v) - parseFloat(arr[0].v)) / (len - 1) : null;
    for (let j = 1; j <= n; j++) {
      const sc = arr[fwd ? (j - 1) % len : len - 1 - ((j - 1) % len)];
      const tc = vert ? sc.c : fwd ? src.c1 + j : src.c0 - j;
      const tr = vert ? (fwd ? src.r1 + j : src.r0 - j) : sc.r;
      if (tc < 0 || tc >= N || tr < 0 || tr >= N) continue;
      let v = sc.v;
      if (step !== null) {
        const base = fwd ? parseFloat(arr[len - 1].v) + step * j : parseFloat(arr[0].v) - step * j;
        v = String(parseFloat(base.toPrecision(12)));
      } else if (v[0] === "=") {
        v = shiftFormula(v, tc - sc.c, tr - sc.r);
      }
      if (v === "") delete out[cellKey(tc, tr)];
      else out[cellKey(tc, tr)] = v;
    }
  }
  return out;
}

const REF_TOKEN =
  /(^|[^A-Za-z0-9_.$])(\$?[A-J]\$?(?:10|[1-9])(?::\$?[A-J]\$?(?:10|[1-9]))?)(?![A-Za-z0-9_.(])/gi;

/**
 * F4: cycles the reference under the caret through A1 → $A$1 → A$1 → $A1.
 * Returns null when the caret isn't on a reference.
 */
export function cycleAbsolute(text: string, caret: number): { text: string; caret: number } | null {
  const re = new RegExp(REF_TOKEN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const end = start + m[2].length;
    if (caret < start || caret > end) continue;
    const first = m[2].split(":")[0];
    const colAbs = first[0] === "$";
    const rowAbs = /^\$?[A-J]\$/i.test(first);
    let dollarCol: boolean;
    let dollarRow: boolean;
    if (!colAbs && !rowAbs) [dollarCol, dollarRow] = [true, true];
    else if (colAbs && rowAbs) [dollarCol, dollarRow] = [false, true];
    else if (!colAbs && rowAbs) [dollarCol, dollarRow] = [true, false];
    else [dollarCol, dollarRow] = [false, false];
    const next = m[2]
      .split(":")
      .map((part) => {
        const q = /^\$?([A-J])\$?(10|[1-9])$/i.exec(part)!;
        return (dollarCol ? "$" : "") + q[1].toUpperCase() + (dollarRow ? "$" : "") + q[2];
      })
      .join(":");
    return { text: text.slice(0, start) + next + text.slice(end), caret: start + next.length };
  }
  return null;
}
