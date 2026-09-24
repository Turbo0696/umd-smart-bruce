import { describe, expect, it } from "vitest";
import {
  type Cells,
  cycleAbsolute,
  evaluateSheet,
  fillRange,
  shiftFormula,
} from "@/lib/spreadsheet";

/** Displayed text of A1 when it holds `formula`, with `others` filled in. */
function show(formula: string, others: Cells = {}): string {
  return evaluateSheet({ ...others, A1: formula }).A1.text;
}

function num(formula: string, others: Cells = {}): number {
  const r = evaluateSheet({ ...others, A1: formula }).A1;
  expect(r.kind).toBe("number");
  return r.num!;
}

describe("statistical functions match Excel", () => {
  it("normal", () => {
    expect(num("=NORM.S.INV(0.975)")).toBeCloseTo(1.959963985, 8);
    expect(num("=NORM.INV(0.975,100,15)")).toBeCloseTo(129.3994598, 6);
    expect(num("=NORM.S.DIST(1.96,1)")).toBeCloseTo(0.9750021049, 9);
    expect(num("=NORM.DIST(0,0,1,0)")).toBeCloseTo(0.3989422804, 9);
  });

  it("t", () => {
    expect(num("=T.INV.2T(0.05,10)")).toBeCloseTo(2.228138852, 8);
    expect(num("=T.INV(0.95,10)")).toBeCloseTo(1.812461123, 8);
    expect(num("=T.INV(0.05,10)")).toBeCloseTo(-1.812461123, 8);
    expect(num("=T.DIST(2.228,10,1)")).toBeCloseTo(0.97499, 4);
    expect(num("=T.DIST.2T(2.228138852,10)")).toBeCloseTo(0.05, 9);
    expect(num("=T.DIST.RT(-1,5)")).toBeCloseTo(0.8183913, 6);
  });

  it("chi-square and F", () => {
    expect(num("=CHISQ.INV.RT(0.05,3)")).toBeCloseTo(7.814727903, 8);
    expect(num("=CHISQ.INV(0.95,3)")).toBeCloseTo(7.814727903, 8);
    expect(num("=CHISQ.DIST.RT(7.814727903,3)")).toBeCloseTo(0.05, 9);
    expect(num("=CHISQ.DIST(2,4,0)")).toBeCloseTo(0.1839397, 6);
    expect(num("=F.INV.RT(0.05,3,10)")).toBeCloseTo(3.708264820, 8);
    expect(num("=F.DIST.RT(3.708264820,3,10)")).toBeCloseTo(0.05, 9);
    expect(num("=F.DIST(1,5,5,1)")).toBeCloseTo(0.5, 9);
  });

  it("binomial", () => {
    expect(num("=BINOM.DIST(3,10,0.5,1)")).toBeCloseTo(0.171875, 12);
    expect(num("=BINOM.DIST(3,10,0.5,0)")).toBeCloseTo(0.1171875, 12);
    expect(num("=BINOM.INV(10,0.5,0.5)")).toBe(5);
  });

  it("descriptive statistics over ranges", () => {
    const col = { B1: "2", B2: "4", B3: "4", B4: "4", B5: "5", B6: "5", B7: "7", B8: "9" };
    expect(num("=AVERAGE(B1:B8)", col)).toBe(5);
    expect(num("=STDEV.P(B1:B8)", col)).toBe(2);
    expect(num("=VAR.S(B1:B8)", col)).toBeCloseTo(4.571428571, 8);
    expect(num("=MEDIAN(B1:B8)", col)).toBe(4.5);
    expect(num("=COUNT(B1:B8)", col)).toBe(8);
    // x = 2,4,4,4 and y = 1,2,3,4: r = 3 / sqrt(3 * 5)
    expect(num("=CORREL(B1:B4,C1:C4)", { ...col, C1: "1", C2: "2", C3: "3", C4: "4" })).toBeCloseTo(
      0.7745966692,
      9,
    );
  });

  it("ignores text in ranges", () => {
    expect(num("=SUM(B1:B3)", { B1: "1", B2: "note", B3: "2" })).toBe(3);
  });
});

describe("evaluation", () => {
  it("handles precedence, unary minus, and parentheses", () => {
    expect(num("=2+3*4")).toBe(14);
    expect(num("=(2+3)*4")).toBe(20);
    expect(num("=-2*-3")).toBe(6);
    expect(num("=10/4-1")).toBe(1.5);
    expect(num("=1E3+1")).toBe(1001);
  });

  it("is case-insensitive and follows references", () => {
    expect(num("=sum(b1:b2)*a2", { B1: "1", B2: "2", A2: "=B1+B2" })).toBe(9);
    expect(num("=$B$1+B$1+$B1", { B1: "2" })).toBe(6);
  });

  it("treats blank cells as 0 and formats to 10 significant digits", () => {
    expect(num("=B1+1")).toBe(1);
    expect(show("=1/3")).toBe("0.3333333333");
    expect(show("=TRUE+TRUE")).toBe("2");
  });

  it("reports Excel-style errors", () => {
    expect(show("=1/0")).toBe("#DIV/0!");
    expect(show("=0/0")).toBe("#DIV/0!");
    expect(show("=SQRT(-1)")).toBe("#NUM!");
    expect(show("=NORM.S.INV(1.5)")).toBe("#NUM!");
    expect(show("=HELLO(1)")).toBe("#NAME?");
    expect(show("=FOO")).toBe("#NAME?");
    expect(show("=K1")).toBe("#NAME?");
    expect(show("=B1+1", { B1: "text" })).toBe("#VALUE!");
    expect(show("=SQRT(B1:B2)", { B1: "1", B2: "2" })).toBe("#VALUE!");
    expect(show("=B1:B2", { B1: "1" })).toBe("#VALUE!");
    expect(show("=1+")).toBe("#ERR!");
    expect(show("=(1")).toBe("#ERR!");
    expect(show("=1 2")).toBe("#ERR!");
    expect(show("=#REF!+1")).toBe("#REF!");
    expect(show("=SUM(A1)")).toBe("#CIRC!");
  });

  it("detects circular references through other cells", () => {
    const r = evaluateSheet({ A1: "=B1", B1: "=C1", C1: "=A1", D1: "=A1+1", E1: "5" });
    expect(r.A1.text).toBe("#CIRC!");
    expect(r.B1.text).toBe("#CIRC!");
    expect(r.C1.text).toBe("#CIRC!");
    expect(r.D1.text).toBe("#CIRC!");
    expect(r.E1.text).toBe("5");
  });

  it("propagates an error from a referenced cell", () => {
    const r = evaluateSheet({ A1: "=B1+1", B1: "=1/0" });
    expect(r.A1.text).toBe("#DIV/0!");
  });

  it("classifies cells", () => {
    const r = evaluateSheet({ A1: "hello", A2: " 3.5 ", A3: "0x10", A4: "=A2*2" });
    expect([r.A1.kind, r.A2.kind, r.A3.kind, r.A4.kind, r.A5.kind]).toEqual([
      "text",
      "number",
      "text",
      "number",
      "empty",
    ]);
    expect(r.A4.num).toBe(7);
  });

  it("does not evaluate arbitrary JavaScript", () => {
    expect(show("=alert(1)")).toBe("#NAME?");
    expect(show("=constructor")).toBe("#NAME?");
    expect(show("=1;2")).toBe("#NAME?");
  });
});

describe("shiftFormula", () => {
  it("moves relative refs and leaves absolute ones", () => {
    expect(shiftFormula("=B2*C2", 0, 1)).toBe("=B3*C3");
    expect(shiftFormula("=$B$2+B2+$B2+B$2", 1, 1)).toBe("=$B$2+C3+$B3+C$2");
    expect(shiftFormula("=SUM(B2:B4)", 2, 0)).toBe("=SUM(D2:D4)");
  });

  it("leaves function names alone and flags refs pushed off the sheet", () => {
    expect(shiftFormula("=T.DIST(A1,5,1)", 1, 0)).toBe("=T.DIST(B1,5,1)");
    expect(shiftFormula("=A1+1", -1, 0)).toBe("=#REF!+1");
    expect(shiftFormula("=J10", 0, 1)).toBe("=#REF!");
  });
});

describe("fillRange", () => {
  it("continues a numeric series", () => {
    const out = fillRange({ A1: "1", A2: "3" }, { c0: 0, c1: 0, r0: 0, r1: 1 }, "d", 3);
    expect([out.A3, out.A4, out.A5]).toEqual(["5", "7", "9"]);
  });

  it("continues a series upward and leftward", () => {
    const up = fillRange({ A5: "10", A6: "20" }, { c0: 0, c1: 0, r0: 4, r1: 5 }, "u", 2);
    expect([up.A4, up.A3]).toEqual(["0", "-10"]);
    const left = fillRange({ E1: "1", F1: "2" }, { c0: 4, c1: 5, r0: 0, r1: 0 }, "l", 2);
    expect([left.D1, left.C1]).toEqual(["0", "-1"]);
  });

  it("copies a single cell and shifts formulas", () => {
    const out = fillRange({ B2: "4", C2: "2.5", D2: "=B2*C2" }, { c0: 3, c1: 3, r0: 1, r1: 1 }, "d", 2);
    expect([out.D3, out.D4]).toEqual(["=B3*C3", "=B4*C4"]);
    const num = fillRange({ A1: "7" }, { c0: 0, c1: 0, r0: 0, r1: 0 }, "r", 2);
    expect([num.B1, num.C1]).toEqual(["7", "7"]);
  });

  it("repeats a mixed pattern and stops at the sheet edge", () => {
    const out = fillRange({ A9: "x", A10: "y" }, { c0: 0, c1: 0, r0: 8, r1: 9 }, "d", 3);
    expect(Object.keys(out).sort()).toEqual(["A10", "A9"]);
    const mixed = fillRange({ A1: "x", A2: "y" }, { c0: 0, c1: 0, r0: 0, r1: 1 }, "d", 3);
    expect([mixed.A3, mixed.A4, mixed.A5]).toEqual(["x", "y", "x"]);
  });
});

describe("cycleAbsolute (F4)", () => {
  it("cycles A1 → $A$1 → A$1 → $A1 → A1", () => {
    let t = "=A1+B2";
    const steps: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = cycleAbsolute(t, 2)!;
      t = r.text;
      steps.push(t);
    }
    expect(steps).toEqual(["=$A$1+B2", "=A$1+B2", "=$A1+B2", "=A1+B2"]);
  });

  it("cycles both ends of a range and returns the new caret", () => {
    expect(cycleAbsolute("=SUM(A1:B3)", 7)).toEqual({ text: "=SUM($A$1:$B$3)", caret: 14 });
  });

  it("ignores the caret when it's not on a reference", () => {
    expect(cycleAbsolute("=SUM(A1)+2", 9)).toBeNull();
    expect(cycleAbsolute("=T.DIST(1,2,1)", 3)).toBeNull();
  });
});

/** Asserts a formula's value to within `tol` (absolute), or to 10 significant digits when omitted. */
function near(formula: string, expected: number, tol?: number, others: Cells = {}) {
  const got = num(formula, others);
  const allowed = tol ?? Math.abs(expected) * 1e-9;
  expect(Math.abs(got - expected) <= allowed).toBe(true);
}

describe("examples from Microsoft's Excel function documentation", () => {
  it("normal", () => {
    near("=NORM.S.DIST(1.333333,TRUE)", 0.908788726, 5e-10);
    near("=NORM.DIST(42,40,1.5,TRUE)", 0.90878878, 5e-9);
    near("=NORM.DIST(42,40,1.5,FALSE)", 0.10934005, 5e-9);
    near("=NORM.INV(0.908789,40,1.5)", 42.000002, 5e-7);
    near("=NORM.S.INV(0.908789)", 1.33333467, 5e-8);
  });

  it("t", () => {
    near("=T.DIST(60,1,TRUE)", 0.99469533, 5e-9);
    // With 3 df the density has a closed form: 2 / (π√3 (1 + t²/3)²).
    near("=T.DIST(8,3,FALSE)", 2 / (Math.PI * Math.sqrt(3) * (1 + 64 / 3) ** 2), 1e-17);
    near("=T.DIST.2T(1.959999998,60)", 0.05464493, 5e-9);
    near("=T.DIST.RT(1.959999998,60)", 0.027322465, 5e-9);
    near("=T.INV(0.75,2)", 0.816496581, 5e-9);
    near("=T.INV.2T(0.546449,60)", 0.606533, 5e-7);
  });

  it("chi-square and F", () => {
    near("=CHISQ.DIST(0.5,1,TRUE)", 0.52049988, 5e-9);
    near("=CHISQ.DIST(2,3,FALSE)", 0.20755375, 5e-9);
    near("=CHISQ.DIST.RT(18.307,10)", 0.0500006, 5e-8);
    near("=CHISQ.INV(0.93,1)", 3.283020286, 5e-9);
    near("=CHISQ.INV.RT(0.050001,10)", 18.30697, 5e-6);
    near("=F.DIST(15.2069,6,4,TRUE)", 0.99, 5e-6);
    near("=F.DIST(15.2069,6,4,FALSE)", 0.0012238, 5e-8);
    near("=F.DIST.RT(15.2069,6,4)", 0.01, 5e-6);
    near("=F.INV(0.01,6,4)", 0.10930991, 5e-9);
    near("=F.INV.RT(0.01,6,4)", 15.20686486, 5e-8);
  });

  it("binomial", () => {
    near("=BINOM.DIST(6,10,0.5,FALSE)", 0.205078125, 1e-15);
    near("=BINOM.INV(6,0.5,0.75)", 4, 0);
  });

  it("descriptive statistics", () => {
    const strength = Object.fromEntries(
      [1345, 1301, 1368, 1322, 1310, 1370, 1318, 1350, 1303, 1299].map((v, i) => [`B${i + 1}`, String(v)]),
    );
    near("=STDEV.S(B1:B10)", 27.46391572, 5e-8, strength);
    near("=STDEV.P(B1:B10)", 26.05455814, 5e-8, strength);
    near("=VAR.S(B1:B10)", 754.2666667, 5e-7, strength);
    near("=VAR.P(B1:B10)", 678.84, 5e-6, strength);
    near("=CORREL(B1:B5,C1:C5)", 0.997054486, 5e-9, { B1: "3", B2: "2", B3: "4", B4: "5", B5: "6", C1: "9", C2: "7", C3: "12", C4: "15", C5: "17" });
    near("=MEDIAN(B1:B6)", 3.5, 0, { B1: "1", B2: "2", B3: "3", B4: "4", B5: "5", B6: "6" });
  });

  it("ROUND and POWER", () => {
    for (const [f, want] of [
      ["=ROUND(2.15,1)", 2.2], ["=ROUND(2.149,1)", 2.1], ["=ROUND(-1.475,2)", -1.48],
      ["=ROUND(21.5,-1)", 20], ["=ROUND(626.3,-3)", 1000], ["=ROUND(1.98,-1)", 0], ["=ROUND(-50.55,-2)", -100],
    ] as const) {
      expect(num(f)).toBe(want);
    }
    near("=POWER(5,2)", 25, 0);
    near("=POWER(98.6,3.2)", 2401077.222, 5e-4);
    near("=POWER(4,5/4)", 5.656854249, 5e-9);
    near("=LN(86)", 4.454347296, 5e-9);
    near("=EXP(2)", 7.389056099, 5e-9);
  });
});

describe("Excel behaviour that differs from plain JavaScript", () => {
  it("ROUND is half away from zero on the decimal value", () => {
    expect(num("=ROUND(2.5,0)")).toBe(3);
    expect(num("=ROUND(-2.5,0)")).toBe(-3);
    expect(num("=ROUND(-0.5,0)")).toBe(-1);
    expect(num("=ROUND(1.005,2)")).toBe(1.01);
    expect(num("=ROUND(-1.005,2)")).toBe(-1.01);
    expect(num("=ROUND(2.675,2)")).toBe(2.68);
    expect(num("=ROUND(123.456,1.9)")).toBe(123.5);
    expect(show("=ROUND(1E21,2)")).toBe("1E+21");
  });

  it("aggregates skip blank and text cells given by reference, but not literals", () => {
    expect(num("=AVERAGE(B1,B2)", { B1: "4" })).toBe(4);
    expect(num("=COUNT(B1,B2)", { B1: "4" })).toBe(1);
    expect(num("=SUM(B1)", { B1: "hello" })).toBe(0);
    expect(num("=MIN(B1,B2)", { B1: "4" })).toBe(4);
    expect(num("=MEDIAN(B1,B2,B3)", { B1: "1", B3: "3" })).toBe(2);
    expect(num("=STDEV.S(B1,B2,B3)", { B1: "1", B2: "3" })).toBeCloseTo(Math.SQRT2, 12);
    expect(num("=AVERAGE(B1,B2,6)", { B1: "4" })).toBe(5);
  });

  it("a blank cell is 0 and text is #VALUE! where a single number is required", () => {
    expect(num("=SQRT(B1)")).toBe(0);
    expect(num("=B1+1")).toBe(1);
    expect(show("=SQRT(B1)", { B1: "abc" })).toBe("#VALUE!");
    expect(show("=B1*2", { B1: "abc" })).toBe("#VALUE!");
  });

  it("CORREL pairs cells by position and drops pairs with a blank or text", () => {
    const cells = { B1: "1", B2: "2", B3: "x", B4: "4", C1: "2", C2: "4", C3: "6", C4: "8" };
    expect(num("=CORREL(B1:B4,C1:C4)", cells)).toBeCloseTo(1, 14);
    expect(show("=CORREL(B1:B4,C1:C3)", cells)).toBe("#N/A");
    expect(show("=CORREL(B1:B2,C1:C2)", { B1: "1", B2: "1", C1: "1", C2: "2" })).toBe("#DIV/0!");
  });

  it("^ and % follow Excel's precedence", () => {
    expect(num("=2^3")).toBe(8);
    expect(num("=-2^2")).toBe(4); // unary minus binds tighter than ^
    expect(num("=2^3^2")).toBe(64); // ^ is left-associative
    expect(num("=2^-1")).toBe(0.5);
    expect(num("=2*3^2")).toBe(18);
    expect(num("=50%")).toBe(0.5);
    expect(num("=200*10%")).toBe(20);
    expect(num("=10%^2")).toBeCloseTo(0.01, 15);
  });

  it("uses Excel's error codes for overflow and invalid powers", () => {
    expect(show("=POWER(0,0)")).toBe("#NUM!");
    expect(show("=0^0")).toBe("#NUM!");
    expect(show("=POWER(0,-1)")).toBe("#DIV/0!");
    expect(show("=POWER(-8,1/3)")).toBe("#NUM!");
    expect(show("=EXP(710)")).toBe("#NUM!");
    expect(show("=1E308*10")).toBe("#NUM!");
    expect(show("=1/0")).toBe("#DIV/0!");
  });

  it("displays like Excel's General format", () => {
    expect(show("=123456789012")).toBe("123456789012");
    expect(show("=1E21")).toBe("1E+21");
    expect(show("=0.00000015")).toBe("1.5E-07");
    expect(show("=1/3")).toBe("0.3333333333");
    expect(show("=-1/3")).toBe("-0.3333333333");
  });
});

describe("accuracy in the tails and at large parameters", () => {
  const rel = (formula: string, expected: number, tol = 1e-12) => {
    const got = num(formula);
    expect(Math.abs(got - expected) <= Math.abs(expected) * tol).toBe(true);
  };

  it("normal tails and quantiles are accurate far from the centre", () => {
    rel("=NORM.S.DIST(-10,1)", 7.619853024160527e-24);
    rel("=NORM.S.INV(1E-15)", -7.941345326170997);
    rel("=NORM.S.INV(0.9999999999)", 6.361340889697422);
    rel("=NORM.S.INV(1E-300)", -37.047096299361199);
    rel("=NORM.S.INV(0.5000000001)", 2.5066284820303539e-10); // just above the median
  });

  it("inverses stay accurate when p is next to 1", () => {
    rel("=CHISQ.INV.RT(0.9999999999,1)", 1.570796586731449e-20);
    rel("=CHISQ.INV.RT(0.9999999999,3)", 5.209397908786167e-7);
    rel("=T.INV.2T(0.9999999999,10000)", 1.253345574262814e-10);
    rel("=F.INV(0.9999999,30,1)", 62609930355540.88, 1e-11);
    rel("=F.INV.RT(0.9999999,1,1000)", 1.5715819195551845e-14, 1e-11);
  });

  it("stays accurate with a million degrees of freedom or trials", () => {
    rel("=T.DIST(-0.001,10000,1)", 0.49960106775952625, 1e-13);
    near("=T.INV.2T(0.05,1000000)", 1.9599, 1e-4);
    near("=NORM.S.INV(0.975)", 1.959963984540054, 1e-14);
    const pmf = num("=BINOM.DIST(500000,1000000,0.5,FALSE)");
    expect(Math.abs(pmf - 7.978845608028654e-4) < 1e-9).toBe(true); // 1/√(π·500000), to 5 digits by Stirling
  });

  it("reports #NUM! rather than a wrong number when a t quantile is beyond double range", () => {
    expect(show("=T.INV.2T(1E-300,1)")).toBe("#NUM!");
  });

  it("BINOM.INV", () => {
    expect(num("=BINOM.INV(2,1E-6,1)")).toBe(2); // all the mass is only reached at n
    expect(num("=BINOM.INV(500,1E-6,1)")).toBe(500);
    expect(num("=BINOM.INV(10,0,1)")).toBe(0);
    expect(num("=BINOM.INV(10,0.5,0)")).toBe(0);
    expect(num("=BINOM.INV(10,0.5,0.623046875)")).toBe(5); // exactly P(X ≤ 5)
    expect(num("=BINOM.INV(2,0.9,0.01)")).toBe(0); // (0.1)² is 0.01 in decimal, so it's a tie that counts
    expect(num("=BINOM.INV(1000000,0.5,0.5)")).toBe(500000); // binary search, so a big n is instant
  });
});

describe("round trips", () => {
  const ps = [1e-12, 1e-6, 0.001, 0.05, 0.3, 0.5, 0.7, 0.95, 0.999, 1 - 1e-9];
  const tol = (p: number) => 1e-12 * Math.min(p, 1 - p) + 1e-15; // absolute in p, tighter in the tails

  it("cdf(inverse(p)) = p", () => {
    for (const p of ps) {
      const check = (inv: string, cdf: (x: string) => string) => {
        const x = num(inv.replace("P", String(p)));
        expect(Math.abs(num(cdf(String(x))) - p) <= tol(p)).toBe(true);
      };
      check("=NORM.S.INV(P)", (x) => `=NORM.S.DIST(${x},1)`);
      check("=T.INV(P,7)", (x) => `=T.DIST(${x},7,1)`);
      check("=CHISQ.INV(P,5)", (x) => `=CHISQ.DIST(${x},5,1)`);
      check("=CHISQ.INV.RT(P,5)", (x) => `=CHISQ.DIST.RT(${x},5)`);
      check("=F.INV(P,4,9)", (x) => `=F.DIST(${x},4,9,1)`);
    }
  });

  it("the t distribution is symmetric", () => {
    for (const x of [0.001, 0.7, 2.3, 9]) {
      expect(num(`=T.DIST(-${x},12,1)`) + num(`=T.DIST(${x},12,1)`)).toBeCloseTo(1, 15);
      expect(num(`=T.DIST.2T(${x},12)`)).toBeCloseTo(2 * num(`=T.DIST.RT(${x},12)`), 15);
    }
  });
});

describe("whole columns and rows", () => {
  const data = { B1: "1", B2: "2", B3: "x", B5: "4", C1: "10", C2: "30", D1: "20" };

  it("A:A and 2:2 cover the whole column or row, skipping blanks and text", () => {
    expect(num("=SUM(B:B)", data)).toBe(7);
    expect(num("=SUM(B:C)", data)).toBe(47);
    expect(num("=SUM(C:B)", data)).toBe(47); // either order
    expect(num("=SUM(2:2)", data)).toBe(32);
    expect(num("=SUM(2:3)", data)).toBe(32);
    expect(num("=COUNT(B:D)", data)).toBe(6);
    expect(num("=AVERAGE($B:$B)", data)).toBeCloseTo(7 / 3, 14);
    expect(num("=MAX(2:$5)", data)).toBe(30);
    expect(num("=CORREL(B:B,C:C)", data)).toBeCloseTo(1, 14); // pairs where both cells are numbers
  });

  it("a whole column that contains the formula's own cell is circular, as in Excel", () => {
    expect(show("=SUM(A:A)")).toBe("#CIRC!");
    expect(show("=SUM(1:1)")).toBe("#CIRC!");
  });

  it("rejects things that aren't columns or rows of this sheet", () => {
    expect(show("=SUM(K:K)")).toBe("#NAME?");
    expect(show("=SUM(11:11)")).toBe("#ERR!");
    expect(show("=B:B", data)).toBe("#VALUE!"); // a range isn't a single value
    expect(show("=2:2", data)).toBe("#VALUE!");
  });

  it("shifts like other references when copied or filled", () => {
    expect(shiftFormula("=SUM(B:B)", 1, 0)).toBe("=SUM(C:C)");
    expect(shiftFormula("=SUM($B:B)", 1, 3)).toBe("=SUM($B:C)");
    expect(shiftFormula("=SUM(A:A)", -1, 0)).toBe("=SUM(#REF!)");
    expect(shiftFormula("=SUM(2:3)", 4, 1)).toBe("=SUM(3:4)");
    expect(shiftFormula("=SUM($2:3)", 0, 1)).toBe("=SUM($2:4)");
    expect(shiftFormula("=SUM(9:10)", 0, 1)).toBe("=SUM(#REF!)");
    expect(shiftFormula("=SUM(A:A)/A1", 1, 1)).toBe("=SUM(B:B)/B2");
    expect(shiftFormula("=SUM(A1:B2)", 1, 1)).toBe("=SUM(B2:C3)"); // cell ranges are unaffected
    const out = fillRange({ A9: "=SUM(A:A)" }, { c0: 0, c1: 0, r0: 8, r1: 8 }, "r", 2);
    expect([out.B9, out.C9]).toEqual(["=SUM(B:B)", "=SUM(C:C)"]);
  });

  it("F4 toggles between A:A and $A:$A", () => {
    expect(cycleAbsolute("=SUM(A:A)", 7)).toEqual({ text: "=SUM($A:$A)", caret: 10 });
    expect(cycleAbsolute("=SUM($A:$C)", 7)).toEqual({ text: "=SUM(A:C)", caret: 8 });
    expect(cycleAbsolute("=SUM(2:3)", 7)).toEqual({ text: "=SUM($2:$3)", caret: 10 });
    expect(cycleAbsolute("=SUM(A:A)", 3)).toBeNull();
  });
});
