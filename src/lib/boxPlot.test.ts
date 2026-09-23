import { describe, expect, it } from "vitest";
import {
  MIN_OUTLIER_N,
  computeBoxPlot,
  generateRandomData,
  parseNumbers,
} from "@/lib/boxPlot";

describe("computeBoxPlot", () => {
  it("uses whole positions p·(n + 1) directly", () => {
    const s = computeBoxPlot([7, 1, 3, 5, 9, 11, 13])!;
    // n = 7: positions 2, 4, 6
    expect(s.median).toBe(7);
    expect([s.q1.position, s.q3.position]).toEqual([2, 6]);
    expect([s.q1.value, s.q3.value, s.iqr]).toEqual([3, 11, 8]);
  });

  it("interpolates like Excel's QUARTILE.EXC", () => {
    const s = computeBoxPlot([1, 2, 3, 4, 5, 6, 7, 8])!;
    // n = 8: positions 2.25, 4.5, 6.75
    expect(s.median).toBe(4.5);
    expect([s.q1.value, s.q3.value]).toEqual([2.25, 6.75]);
    // QUARTILE.EXC({2,4,4,5,6,8,9,10,15,21}, 1 / 3) = 4 and 11.25
    const t = computeBoxPlot([2, 4, 4, 5, 6, 8, 9, 10, 15, 21])!;
    expect([t.q1.value, t.q3.value]).toEqual([4, 11.25]);
    expect([t.q3.below, t.q3.above]).toEqual([10, 15]);
  });

  it("flags values beyond the 1.5×IQR fences and stops whiskers inside them", () => {
    const s = computeBoxPlot([12, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 31, 48])!;
    // Q1 = 18, Q3 = 27, IQR = 9, fences 4.5 and 40.5
    expect([s.q1.value, s.median, s.q3.value]).toEqual([18, 22, 27]);
    expect([s.lowerFence, s.upperFence]).toEqual([4.5, 40.5]);
    expect(s.outliers).toEqual([48]);
    expect([s.whiskerLow, s.whiskerHigh]).toEqual([12, 31]);
    expect(s.max).toBe(48);
  });

  it("needs at least four values", () => {
    expect(computeBoxPlot([1, 2, 3])).toBeNull();
  });
});

describe("parseNumbers", () => {
  it("accepts commas, spaces, tabs, and new lines, and reports junk", () => {
    expect(parseNumbers("1, 2\t3\n4;5  -6.5 abc")).toEqual({
      values: [1, 2, 3, 4, 5, -6.5],
      invalid: ["abc"],
    });
  });
});

describe("generateRandomData", () => {
  it("returns the requested count of whole numbers", () => {
    const data = generateRandomData(50, "normal", true);
    expect(data).toHaveLength(50);
    expect(data.every(Number.isInteger)).toBe(true);
  });

  it("plants outliers the fence rule catches", () => {
    for (const n of [MIN_OUTLIER_N, 10, 30, 200]) {
      for (const shape of ["normal", "uniform", "skewed"] as const) {
        const s = computeBoxPlot(generateRandomData(n, shape, true))!;
        expect(s.outliers.length).toBeGreaterThan(0);
      }
    }
  });
});
