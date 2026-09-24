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
