// The Excel Simulator's functions against 28-digit reference values from mpmath,
// covering extreme tails, p next to 1, degrees of freedom up to 1e7, n up to 1e6,
// 90-cell ranges, ROUND against exact decimal arithmetic, and random expressions.
// Regenerate with the scripts in scripts/spreadsheet-reference/.
//
// The engine is far tighter than the tolerance here almost everywhere (normal,
// chi-square, F and binomial functions agree to ~1e-13 or better; the tolerance
// leaves room for a t distribution with ten million degrees of freedom, the one
// place the continued fraction runs out of digits, at ~1e-11).

import { describe, expect, it } from "vitest";
import reference from "@/lib/__fixtures__/spreadsheetReference.json";
import { type Cells, evaluateSheet } from "@/lib/spreadsheet";

type Case = { f: string; e: string; c?: Cells };

const TOLERANCE = 3e-11;

const byFunction = new Map<string, Case[]>();
for (const c of reference as Case[]) {
  const name = /^=([A-Z][A-Z0-9.]*)\(/.exec(c.f)?.[1] ?? "EXPR";
  byFunction.set(name, [...(byFunction.get(name) ?? []), c]);
}

describe("reference values", () => {
  for (const [name, cases] of byFunction) {
    it(`${name} (${cases.length} cases)`, () => {
      const failures: string[] = [];
      for (const c of cases) {
        const r = evaluateSheet({ ...c.c, A1: c.f }).A1;
        if (c.e.startsWith("#")) {
          if (r.text !== c.e) failures.push(`${c.f}: got ${r.text}, want ${c.e}`);
          continue;
        }
        const want = Number(c.e);
        if (r.kind !== "number") {
          failures.push(`${c.f}: got ${r.text}, want ${c.e}`);
          continue;
        }
        // Values below the smallest double can only be checked to be (near) zero.
        const err = Math.abs(want) < 1e-300 ? Math.abs(r.num!) : Math.abs(r.num! - want) / Math.abs(want);
        if (!(err <= (Math.abs(want) < 1e-300 ? 1e-290 : TOLERANCE))) {
          failures.push(`${c.f}: got ${r.num}, want ${c.e} (relative error ${err.toExponential(2)})`);
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }

  it("covers every distribution function", () => {
    for (const name of [
      "NORM.DIST", "NORM.S.DIST", "NORM.INV", "NORM.S.INV", "T.DIST", "T.DIST.2T", "T.DIST.RT",
      "T.INV", "T.INV.2T", "CHISQ.DIST", "CHISQ.DIST.RT", "CHISQ.INV", "CHISQ.INV.RT", "F.DIST",
      "F.DIST.RT", "F.INV", "F.INV.RT", "BINOM.DIST", "ROUND", "CORREL", "STDEV.S", "EXPR",
    ]) {
      expect(byFunction.get(name)?.length ?? 0).toBeGreaterThan(5);
    }
  });
});
