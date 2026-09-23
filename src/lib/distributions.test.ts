import { describe, expect, it } from "vitest";
import { normalPdf, tPValues, tPdf, zPValues } from "@/lib/distributions";

describe("zPValues", () => {
  it("matches textbook critical values", () => {
    // z(0.975) = 1.959964, z(0.95) = 1.644854, z(0.995) = 2.575829
    expect(zPValues(1.959964).two).toBeCloseTo(0.05, 6);
    expect(zPValues(1.644854).right).toBeCloseTo(0.05, 6);
    expect(zPValues(2.575829).two).toBeCloseTo(0.01, 6);
  });

  it("matches known CDF values", () => {
    expect(zPValues(-1).left).toBeCloseTo(0.158655253931457, 12);
    expect(zPValues(0.3).left).toBeCloseTo(0.617911422188953, 12);
    expect(zPValues(0).two).toBeCloseTo(1, 12);
  });

  it("keeps precision far out in the tail", () => {
    // P(Z ≥ 8) ≈ 6.22096e-16 — lost entirely if computed as 1 − P(Z ≤ 8).
    expect(zPValues(8).right / 6.22096057427e-16).toBeCloseTo(1, 6);
    expect(zPValues(-8).left).toBe(zPValues(8).right);
  });
});

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

  it("approaches the normal for large df", () => {
    expect(tPValues(1.96, 1e7).two).toBeCloseTo(zPValues(1.96).two, 6);
  });
});

describe("densities", () => {
  it("peak at 1/π for the Cauchy case and 1/√(2π) for the normal", () => {
    expect(tPdf(0, 1)).toBeCloseTo(1 / Math.PI, 10);
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(tPdf(0, 1e6)).toBeCloseTo(normalPdf(0), 5);
  });
});
