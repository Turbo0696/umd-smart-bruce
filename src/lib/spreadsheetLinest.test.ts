// LINEST against exact-arithmetic reference values (see scripts/spreadsheet-reference/gen_linest.py),
// plus properties any least-squares fit must satisfy and the edges of the 15 × 15 sheet.

import { describe, expect, it } from "vitest";
import reference from "@/lib/__fixtures__/linestReference.json";
import { type Cells, COLS, evaluateSheet, fillRange, shiftFormula } from "@/lib/spreadsheet";

interface Reference {
  kind: string;
  row: boolean;
  const: boolean;
  y: string[];
  x: string[][];
  e: {
    coef: string[];
    se: (string | null)[];
    r2: string;
    sey: string;
    f: string;
    df: number;
    ssreg: string;
    ssresid: string;
  };
}

// Worst relative errors seen are ~1e-12 for ordinary data and ~1e-9 where the intercept cancels
// against a large offset or two columns are nearly identical; the tolerances leave 10× headroom.
const TOLERANCE: Record<string, number> = {
  normal: 1e-11,
  tiny: 1e-11,
  huge: 1e-11,
  int: 1e-11,
  offset: 1e-8,
  nearcol: 1e-8,
};

const key = (c: number, r: number) => COLS[c] + (r + 1);
const range = (c0: number, r0: number, c1: number, r1: number) => `${key(c0, r0)}:${key(c1, r1)}`;

/** Lays a reference case out on the sheet, with the formula (full statistics) to its right or below. */
function run(c: Reference) {
  const n = c.y.length;
  const k = c.x[0].length;
  const cells: Cells = {};
  let anchor: [number, number];
  let f: string;
  if (!c.row) {
    c.y.forEach((v, t) => (cells[key(0, t)] = v));
    c.x.forEach((row, t) => row.forEach((v, j) => (cells[key(1 + j, t)] = v)));
    anchor = [k + 2, 0];
    f = `=LINEST(${range(0, 0, 0, n - 1)},${range(1, 0, k, n - 1)},${c.const ? "TRUE" : "FALSE"},TRUE)`;
  } else {
    c.y.forEach((v, t) => (cells[key(t, 0)] = v));
    c.x.forEach((row, t) => row.forEach((v, j) => (cells[key(t, 1 + j)] = v)));
    anchor = [0, k + 2];
    f = `=LINEST(${range(0, 0, n - 1, 0)},${range(0, 1, n - 1, k)},${c.const ? "TRUE" : "FALSE"},TRUE)`;
  }
  cells[key(...anchor)] = f;
  const res = evaluateSheet(cells);
  return (row: number, col: number) => res[key(anchor[0] + col, anchor[1] + row)];
}

describe("LINEST against exact reference values", () => {
  const cases = reference as Reference[];

  for (const kind of Object.keys(TOLERANCE)) {
    const ofKind = cases.filter((c) => c.kind === kind);
    it(`${kind} (${ofKind.length} cases)`, () => {
      const failures: string[] = [];
      ofKind.forEach((c, i) => {
        const at = run(c);
        const k = c.x[0].length;
        const tol = TOLERANCE[kind];
        const check = (what: string, got: number | null, want: string) => {
          const w = Number(want);
          const err = got === null ? Infinity : Math.abs(got - w) / Math.max(Math.abs(w), 1e-300);
          if (!(err <= tol)) failures.push(`${kind} #${i} ${what}: got ${got}, want ${want} (rel ${err.toExponential(2)})`);
        };
        for (let j = 0; j <= k; j++) {
          // An exact zero (the intercept with const = FALSE) has no relative error to measure.
          if (c.e.coef[j] === "0") expect(at(0, j).num).toBe(0);
          else check(`coef[${j}]`, at(0, j).num, c.e.coef[j]);
          const se = c.e.se[j];
          if (se === null) expect(at(1, j).text).toBe("#N/A");
          else check(`se[${j}]`, at(1, j).num, se);
        }
        check("r2", at(2, 0).num, c.e.r2);
        check("sey", at(2, 1).num, c.e.sey);
        check("F", at(3, 0).num, c.e.f);
        expect(at(3, 1).num).toBe(c.e.df);
        check("ssreg", at(4, 0).num, c.e.ssreg);
        check("ssresid", at(4, 1).num, c.e.ssresid);
        // The unused cells of rows 3–5 are #N/A.
        for (let r = 2; r < 5; r++) for (let col = 2; col <= k; col++) expect(at(r, col).text).toBe("#N/A");
      });
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }

  it("covers both layouts, with and without an intercept, and up to five variables", () => {
    expect(cases.some((c) => c.row)).toBe(true);
    expect(cases.some((c) => !c.row)).toBe(true);
    expect(cases.some((c) => c.const)).toBe(true);
    expect(cases.some((c) => !c.const)).toBe(true);
    expect(Math.max(...cases.map((c) => c.x[0].length))).toBe(5);
  });
});

/* ---------- properties of a least-squares fit ---------- */

const col = (c: string, v: number[], r0 = 1): Cells =>
  Object.fromEntries(v.map((x, i) => [c + (r0 + i), String(x)]));
const lin = (cells: Cells, f: string, at = "F1") => evaluateSheet({ ...cells, [at]: f });
const num = (r: ReturnType<typeof lin>, k: string) => r[k].num as number;
const near = (a: number | null | undefined, b: number, tol = 1e-9) =>
  a !== null && a !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// Fixed data (generated once from a seeded normal sampler): y ≈ 3 + 2·x1 − 1.5·x2 + noise.
const N = 12;
const X1 = [12.17, 8.43, 10.9, 14.62, 6.35, 9.58, 11.21, 13.04, 7.76, 10.33, 15.29, 9.01];
const X2 = [4.88, 6.12, 3.57, 7.4, 5.26, 2.94, 6.83, 4.15, 5.71, 3.38, 6.49, 4.52];
const NOISE = [0.31, -0.84, 1.12, -0.27, 0.66, -1.05, 0.42, -0.19, 0.9, -0.58, 0.14, -0.73];
const Y = X1.map((a, i) => +(3 + 2 * a - 1.5 * X2[i] + NOISE[i]).toFixed(2));
const base: Cells = { ...col("A", Y), ...col("B", X1), ...col("C", X2) };
const FULL = "=LINEST(A1:A12,B1:C12,TRUE,TRUE)";
const SIMPLE = "=LINEST(A1:A12,B1:B12,TRUE,TRUE)";
const fit = lin(base, FULL);

describe("LINEST properties", () => {
  it("scaling y scales coefficients and standard errors, and leaves R², F and df alone", () => {
    const c = 7.5;
    const r = lin({ ...col("A", Y.map((a) => +(a * c).toFixed(6))), ...col("B", X1), ...col("C", X2) }, FULL);
    for (const k of ["F1", "G1", "H1", "F2", "G2", "H2"]) expect(near(num(r, k), num(fit, k) * c, 1e-6)).toBe(true);
    for (const k of ["F3", "F4"]) expect(near(num(r, k), num(fit, k), 1e-6)).toBe(true);
    expect(num(r, "G4")).toBe(num(fit, "G4"));
  });

  it("shifting y moves only the intercept", () => {
    const r = lin({ ...col("A", Y.map((a) => a + 100)), ...col("B", X1), ...col("C", X2) }, FULL);
    expect(near(num(r, "F1"), num(fit, "F1"), 1e-8)).toBe(true);
    expect(near(num(r, "H1"), num(fit, "H1") + 100, 1e-8)).toBe(true);
    expect(near(num(r, "F2"), num(fit, "F2"), 1e-8)).toBe(true);
  });

  it("rescaling one x rescales only its own coefficient", () => {
    const r = lin({ ...col("A", Y), ...col("B", X1.map((a) => a * 4)), ...col("C", X2) }, FULL);
    expect(near(num(r, "G1"), num(fit, "G1") / 4, 1e-9)).toBe(true);
    expect(near(num(r, "F1"), num(fit, "F1"), 1e-9)).toBe(true);
    expect(near(num(r, "F3"), num(fit, "F3"), 1e-9)).toBe(true);
  });

  it("does not depend on the order of the observations", () => {
    const perm = [7, 2, 10, 0, 5, 11, 3, 9, 1, 8, 4, 6];
    const P = (a: number[]) => perm.map((i) => a[i]);
    const r = lin({ ...col("A", P(Y)), ...col("B", P(X1)), ...col("C", P(X2)) }, FULL);
    for (const k of ["F1", "G1", "H1", "F2", "G2", "H2", "F3", "G3", "F4", "G4", "F5", "G5"]) {
      expect(near(num(r, k), num(fit, k), 1e-11)).toBe(true);
    }
  });

  it("agrees with CORREL, STDEV.S, VAR.S and the F and t distributions", () => {
    const s = lin(
      { ...base, H1: "=CORREL(A1:A12,B1:B12)", H2: "=STDEV.S(A1:A12)", H3: "=STDEV.S(B1:B12)", H4: "=VAR.S(A1:A12)",
        H5: "=F.DIST.RT(F4,1,G4)", H6: "=T.DIST.2T(ABS(F1/F2),G4)" },
      SIMPLE,
    );
    const r = num(s, "H1");
    expect(near(num(s, "F3"), r * r, 1e-11)).toBe(true); // R² = r²
    expect(near(num(s, "F1"), (r * num(s, "H2")) / num(s, "H3"), 1e-11)).toBe(true); // slope = r·sy/sx
    const t = num(s, "F1") / num(s, "F2");
    expect(near(num(s, "F4"), t * t, 1e-9)).toBe(true); // F = t² with one variable
    expect(near(num(s, "H5"), num(s, "H6"), 1e-9)).toBe(true); // both tests give the same p-value
    expect(near(num(s, "F5") + num(s, "G5"), (N - 1) * num(s, "H4"), 1e-11)).toBe(true); // SSreg + SSresid = SStotal
  });
});

describe("LINEST with dependent columns, like Excel", () => {
  const two = lin(base, FULL, "K1");

  it("a column that is a multiple of an earlier one gets coefficient 0, standard error 0, and no df", () => {
    const r = lin(
      { ...col("A", Y), ...col("B", X1), ...col("C", X1.map((a) => a * 2)), ...col("D", X2) },
      "=LINEST(A1:A12,B1:D12,TRUE,TRUE)",
    );
    // Output order is D, C, B, intercept; C is the dropped one.
    expect([r.G1.num, r.G2.num]).toEqual([0, 0]);
    expect(r.G4.num).toBe(N - 3);
    expect(near(r.F1.num, two.K1.num, 1e-9)).toBe(true);
    expect(near(r.H1.num, two.L1.num, 1e-9)).toBe(true);
    expect(near(r.I1.num, two.M1.num, 1e-9)).toBe(true);
  });

  it("a constant column with an intercept, or an all-zero column, is dropped", () => {
    const simple = lin(base, "=LINEST(A1:A12,B1:B12,TRUE,TRUE)");
    for (const filler of [4, 0]) {
      const r = lin({ ...col("A", Y), ...col("B", X1), ...col("C", Array<number>(N).fill(filler)) }, FULL);
      expect([r.F1.num, r.F2.num]).toEqual([0, 0]);
      expect(near(r.G1.num, simple.F1.num, 1e-9)).toBe(true);
      expect(near(r.H1.num, simple.G1.num, 1e-9)).toBe(true);
    }
  });
});

describe("LINEST with too little data", () => {
  it("a line through two points is exact, with nothing left to estimate errors from", () => {
    const r = lin({ A1: "1", A2: "3", B1: "1", B2: "2" }, "=LINEST(A1:A2,B1:B2,TRUE,TRUE)", "E1");
    expect(near(r.E1.num, 2, 1e-12)).toBe(true);
    expect(near(r.F1.num, -1, 1e-12)).toBe(true);
    expect([r.E2.text, r.F2.text, r.F4.text, r.E4.text]).toEqual(["#NUM!", "#NUM!", "0", "#NUM!"]);
  });

  it("one more point than parameters leaves one degree of freedom", () => {
    expect(lin({ A1: "1", A2: "3", A3: "2", B1: "1", B2: "2", B3: "3" }, "=LINEST(A1:A3,B1:B3,TRUE,TRUE)", "E1").F4.num).toBe(1);
    expect(lin({ A1: "1", A2: "3", A3: "2", B1: "1", B2: "2", B3: "3" }, "=LINEST(A1:A3,B1:B3,FALSE,TRUE)", "E1").F4.num).toBe(2);
  });

  it("fewer points than parameters is #NUM!", () => {
    expect(lin({ A1: "1", A2: "3", B1: "1", B2: "2", C1: "4", C2: "1" }, "=LINEST(A1:A2,B1:C2)", "E1").E1.text).toBe("#NUM!");
  });

  it("constant y has slope 0 and no R²", () => {
    const r = lin({ A1: "5", A2: "5", A3: "5", A4: "5", B1: "1", B2: "2", B3: "3", B4: "4" }, "=LINEST(A1:A4,B1:B4,TRUE,TRUE)", "E1");
    expect(r.E1.num).toBe(0);
    expect(r.E3.text).toBe("#NUM!");
  });

  it("points exactly on a line give R² of 1 and standard errors at rounding level", () => {
    const r = lin({ A1: "1", A2: "3", A3: "5", B1: "1", B2: "2", B3: "3" }, "=LINEST(A1:A3,B1:B3,TRUE,TRUE)", "E1");
    expect(Math.abs(r.E2.num!)).toBeLessThan(1e-12);
    expect(near(r.E3.num, 1, 1e-12)).toBe(true);
  });
});

describe("LINEST and the 15 × 15 sheet", () => {
  const line: Cells = {};
  for (let r = 1; r <= 15; r++) {
    line["A" + r] = String(r);
    line["B" + r] = String(2 * r + 1);
  }
  const at = (cell: string) => evaluateSheet({ ...line, [cell]: "=LINEST(B1:B15,A1:A15,TRUE,TRUE)" })[cell].text;

  it("fits all 15 rows, and whole columns and rows reach row 15 and column O", () => {
    const s = evaluateSheet({
      ...line,
      D1: "=SUM(A:A)", D2: "=COUNT(B:B)", D3: "=AVERAGE(A15:B15)", D4: "=SUM(15:15)",
      F1: "=LINEST(B1:B15,A1:A15,TRUE,TRUE)",
    });
    expect([s.D1.num, s.D2.num, s.D3.num, s.D4.num]).toEqual([120, 15, 23, 46]);
    expect(near(s.F1.num, 2, 1e-12)).toBe(true); // slope
    expect(near(s.G1.num, 1, 1e-12)).toBe(true); // intercept
    expect(near(s.F3.num, 1, 1e-12)).toBe(true); // R²
  });

  it("a block fits against the right and bottom edges, and #SPILL!s one cell past them", () => {
    expect(at("N1")).not.toBe("#SPILL!"); // columns N:O
    expect(at("N11")).not.toBe("#SPILL!"); // rows 11–15
    expect(at("O1")).toBe("#SPILL!");
    expect(at("N12")).toBe("#SPILL!");
  });

  it("references stop at column O and row 15", () => {
    expect(evaluateSheet({ A1: "=P1" }).A1.text).toBe("#NAME?");
    expect(evaluateSheet({ A1: "=A16" }).A1.kind).toBe("error");
    expect(shiftFormula("=N14", 1, 1)).toBe("=O15");
    expect(shiftFormula("=O15", 1, 0)).toBe("=#REF!");
    expect(shiftFormula("=O15", 0, 1)).toBe("=#REF!");
  });

  it("fills stop at the edges", () => {
    const down = fillRange({ A1: "1", A2: "2" }, { c0: 0, c1: 0, r0: 0, r1: 1 }, "d", 20);
    expect([Object.keys(down).length, down.A15, down.A16]).toEqual([15, "15", undefined]);
    const right = fillRange({ A1: "=B1*2" }, { c0: 0, c1: 0, r0: 0, r1: 0 }, "r", 20);
    expect([Object.keys(right).length, right.O1, right.P1]).toEqual([15, "=#REF!*2", undefined]);
  });
});

describe("LINEST spills", () => {
  const d: Cells = { ...col("A", [1, 2, 3, 4, 5, 6]), ...col("B", [2.1, 3.9, 6.2, 7.8, 10.1, 12.2]) };
  const FULL6 = "=LINEST(B1:B6,A1:A6,TRUE,TRUE)";

  it("a formula inside another's block leaves that one #SPILL!, and still evaluates itself", () => {
    const r = evaluateSheet({ ...d, D1: FULL6, D2: "=LINEST(B1:B6,A1:A6)" });
    expect(r.D1.text).toBe("#SPILL!");
    expect(r.D2.kind).toBe("number");
  });

  it("separate blocks coexist, and a blocker cell comes and goes", () => {
    const two = evaluateSheet({ ...d, D1: FULL6, F1: "=LINEST(B1:B6,A1:A6)" });
    expect([two.D1.kind, two.E1.kind, two.F1.kind, two.G1.kind]).toEqual(["number", "number", "number", "number"]);
    expect(evaluateSheet({ ...d, D1: FULL6, E3: "=1" }).D1.text).toBe("#SPILL!");
    expect(evaluateSheet({ ...d, D1: FULL6 }).E5.kind).toBe("number");
  });

  it("other formulas read spilled cells, singly and as ranges", () => {
    const r = evaluateSheet({ A1: "1", A2: "2", A3: "3", A4: "4", B1: "3", B2: "5", B3: "7", B4: "9", D1: "=LINEST(B1:B4,A1:A4)", A6: "=D1", A7: "=E1" });
    expect(near(r.A6.num, 2, 1e-12)).toBe(true);
    expect(near(r.A7.num, 1, 1e-12)).toBe(true);
    const s = evaluateSheet({ ...d, D1: FULL6, D8: "=SUM(D1:E5)" });
    const total = ["D", "E"]
      .flatMap((c) => [1, 2, 3, 4, 5].map((n) => s[c + n]))
      .filter((x) => x.kind === "number")
      .reduce((acc, x) => acc + x.num!, 0);
    expect(near(s.D8.num, total, 1e-12)).toBe(true);
  });

  it("circular references stay contained", () => {
    expect(evaluateSheet({ ...d, D1: FULL6, D8: "=D8+1" }).D8.text).toBe("#CIRC!");
    expect(evaluateSheet({ ...d, D1: FULL6, D8: "=D8+1" }).D1.kind).toBe("number");
    // Inputs that overlap the formula's own block must terminate rather than loop.
    expect(["error", "number"]).toContain(evaluateSheet({ ...d, D1: "=LINEST(B1:B6,E1:E6,TRUE,TRUE)" }).D1.kind);
  });
});
