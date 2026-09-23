import { describe, expect, it } from "vitest";
import { tPValues, tPdf } from "@/lib/tDistribution";

describe("tPValues", () => {
  it("matches textbook critical values", () => {
    // t(0.975, 20) = 2.086, t(0.995, 10) = 3.169, t(0.95, 5) = 2.015
    expect(tPValues(2.086, 20).two).toBeCloseTo(0.05, 4);
    expect(tPValues(3.169, 10).two).toBeCloseTo(0.01, 4);
    expect(tPValues(2.015, 5).right).toBeCloseTo(0.05, 4);
  });

  it("reduces to the Cauchy distribution at df = 1", () => {
    // P(T ≤ 1) = 1/2 + atan(1)/π = 0.75
    expect(tPValues(1, 1).left).toBeCloseTo(0.75, 10);
  });

  it("is symmetric and self-consistent", () => {
    const pos = tPValues(1.7, 12);
    const neg = tPValues(-1.7, 12);
    expect(neg.left).toBeCloseTo(pos.right, 12);
    expect(pos.left + pos.right).toBeCloseTo(1, 12);
    expect(pos.two).toBeCloseTo(2 * pos.right, 12);
    expect(tPValues(0, 7).two).toBeCloseTo(1, 12);
  });
});

describe("tPdf", () => {
  it("peaks at 1/π for the Cauchy case", () => {
    expect(tPdf(0, 1)).toBeCloseTo(1 / Math.PI, 10);
  });

  it("approaches the standard normal for large df", () => {
    expect(tPdf(0, 1e6)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 5);
  });
});
