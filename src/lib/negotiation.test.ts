import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEGOTIATION_CONFIG,
  batchSchedules,
  centralizedOptimum,
  clampNote,
  clampPrice,
  clampQuantities,
  consolidatedSchedule,
  coordinationLoss,
  feasibilityReport,
  groupedSchedule,
  lotForLotSchedule,
  optimalProcurement,
  retailerSettlement,
  roundDeadlineFrom,
  settleDyad,
  settleMonths,
  shuffleSeeded,
  wholesalerSettlement,
} from "./negotiation";

// The two schedules the paper names explicitly (p.7): the retailer's actual
// cost-minimizing preference, and the wholesaler's preferred consolidation.
const LOT_FOR_LOT = [750, 2000, 750, 1500];
const CONSOLIDATED = [5000, 0, 0, 0];

describe("settleMonths — no-backlog monthly settlement", () => {
  it("draws inventory to exactly zero when deliveries match demand month for month", () => {
    const { sold, unmet, ending } = settleMonths(LOT_FOR_LOT, LOT_FOR_LOT);
    expect(sold).toEqual(LOT_FOR_LOT);
    expect(unmet).toEqual([0, 0, 0, 0]);
    expect(ending).toEqual([0, 0, 0, 0]);
  });

  it("carries surplus forward as ending inventory when delivered early", () => {
    const { ending } = settleMonths(CONSOLIDATED, LOT_FOR_LOT);
    // 5000 delivered in month 1, drawn down by each month's demand.
    expect(ending).toEqual([4250, 2250, 1500, 0]);
  });

  it("loses unmet demand rather than backlogging it — a short month never borrows from a later one", () => {
    const { sold, unmet, ending } = settleMonths([750, 500, 750, 1500], LOT_FOR_LOT);
    expect(sold).toEqual([750, 500, 750, 1500]);
    expect(unmet).toEqual([0, 1500, 0, 0]); // June's 1,500-unit shortfall is gone, not owed later
    expect(ending).toEqual([0, 0, 0, 0]);
  });
});

describe("retailerSettlement — the retailer's own P&L", () => {
  it("strictly prefers lot-for-lot over a consolidated delivery, matching the paper's own claim (p.7)", () => {
    const lotForLot = retailerSettlement(45, LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG);
    const consolidated = retailerSettlement(45, CONSOLIDATED, DEFAULT_NEGOTIATION_CONFIG);
    expect(lotForLot.profit).toBe(67000);
    expect(consolidated.profit).toBe(49000);
    expect(lotForLot.profit).toBeGreaterThan(consolidated.profit);
    // The whole $18,000 gap is ordering vs. holding cost, not lost sales —
    // both schedules deliver the full 5,000 units.
    expect(lotForLot.unitsSold).toBe(5000);
    expect(consolidated.unitsSold).toBe(5000);
  });

  it("salvages leftover stock at the end of the horizon rather than losing it", () => {
    const overDelivered = [750, 2000, 750, 2500]; // 1,000 units more than August's demand
    const result = retailerSettlement(45, overDelivered, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.endingInventory).toBe(1000);
    expect(result.salvageRevenue).toBe(31 * 1000);
  });

  it("reports unmet demand rather than crashing on a deliberately short contract", () => {
    const short = [750, 2000, 750, 1000]; // 500 units short in August
    const result = retailerSettlement(45, short, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.unmetDemand).toBe(500);
    expect(result.unitsSold).toBe(4500);
  });
});

describe("optimalProcurement — the wholesaler's exact cost-minimizing lot-sizing", () => {
  it("finds a genuine partial-consolidation optimum given a lot-for-lot delivery obligation — not naive JIT, not full consolidation", () => {
    const result = optimalProcurement(LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG);
    // Verified exhaustively: 4 monthly JIT orders would cost $20,000 (4 * $5,000,
    // zero holding); one upfront order would cost $21,000 ($5,000 + $16,000
    // holding). The true optimum splits the difference by ordering twice.
    expect(result.schedule).toEqual([750, 2750, 0, 1500]);
    expect(result.cost).toBe(16500);
    expect(result.orders).toBe(3);
  });

  it("collapses to a single order when the delivery obligation is itself already consolidated", () => {
    const result = optimalProcurement(CONSOLIDATED, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.schedule).toEqual([5000, 0, 0, 0]);
    expect(result.cost).toBe(5000);
    expect(result.orders).toBe(1);
  });

  it("never returns a schedule costing more than the two named extremes (JIT and full consolidation)", () => {
    const jitCost = 4 * DEFAULT_NEGOTIATION_CONFIG.wholesalerOrderCost; // matches delivery exactly, zero holding
    const fullConsolidationCost = 1 * DEFAULT_NEGOTIATION_CONFIG.wholesalerOrderCost + 2 * (4250 + 2250 + 1500 + 0);
    const result = optimalProcurement(LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.cost).toBeLessThanOrEqual(Math.min(jitCost, fullConsolidationCost));
  });
});

describe("wholesalerSettlement — the wholesaler's own P&L, at its own optimal procurement", () => {
  it("strictly prefers a consolidated delivery contract over lot-for-lot — the mirror-image preference from the retailer's", () => {
    const lotForLotProcurement = optimalProcurement(LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG).schedule;
    const consolidatedProcurement = optimalProcurement(CONSOLIDATED, DEFAULT_NEGOTIATION_CONFIG).schedule;
    const underLotForLot = wholesalerSettlement(45, LOT_FOR_LOT, lotForLotProcurement, DEFAULT_NEGOTIATION_CONFIG);
    const underConsolidated = wholesalerSettlement(45, CONSOLIDATED, consolidatedProcurement, DEFAULT_NEGOTIATION_CONFIG);
    expect(underLotForLot.profit).toBe(58500);
    expect(underConsolidated.profit).toBe(70000);
    expect(underConsolidated.profit).toBeGreaterThan(underLotForLot.profit);
  });
});

describe("chain profit — the negotiated price is a pure transfer", () => {
  it("is completely independent of the wholesale price for a fixed delivery/procurement schedule", () => {
    const procurement = optimalProcurement(LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG).schedule;
    const chainProfits = [31, 40, 50, 59].map((w) => {
      const retailer = retailerSettlement(w, LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG);
      const wholesaler = wholesalerSettlement(w, LOT_FOR_LOT, procurement, DEFAULT_NEGOTIATION_CONFIG);
      return retailer.profit + wholesaler.profit;
    });
    // Every price yields the same chain profit — this is the headline
    // teaching point (the debrief should say this explicitly).
    expect(new Set(chainProfits).size).toBe(1);
    expect(chainProfits[0]).toBe(125500);
  });
});

describe("centralizedOptimum — the paper's vertically-integrated first-best (p.10)", () => {
  it("matches the exhaustively-verified optimum for the default parameters", () => {
    const result = centralizedOptimum(DEFAULT_NEGOTIATION_CONFIG);
    expect(result.deliverySchedule).toEqual([750, 2750, 0, 1500]);
    expect(result.procurementSchedule).toEqual([750, 2750, 0, 1500]);
    expect(result.profit).toBe(126750);
    expect(result.retailerLogisticsCost).toBe(8250);
    expect(result.wholesalerLogisticsCost).toBe(15000);
  });

  it("is a genuine upper bound: no achievable (price, delivery, procurement) combination beats it", () => {
    const centralProfit = centralizedOptimum(DEFAULT_NEGOTIATION_CONFIG).profit;
    const deliveryCandidates = batchSchedules(DEFAULT_NEGOTIATION_CONFIG.monthlyDemand);
    for (const delivery of deliveryCandidates) {
      const procurement = optimalProcurement(delivery, DEFAULT_NEGOTIATION_CONFIG).schedule;
      for (const w of [31, 40, 50, 59]) {
        const retailer = retailerSettlement(w, delivery, DEFAULT_NEGOTIATION_CONFIG);
        const wholesaler = wholesalerSettlement(w, delivery, procurement, DEFAULT_NEGOTIATION_CONFIG);
        expect(retailer.profit + wholesaler.profit).toBeLessThanOrEqual(centralProfit + 1e-9);
      }
    }
  });

  it("is unaffected by the wholesale price — it never appears in the integrated firm's own objective", () => {
    // centralizedOptimum takes no price argument at all; changing the range
    // of prices a dyad might negotiate can't move this number.
    const first = centralizedOptimum(DEFAULT_NEGOTIATION_CONFIG);
    const second = centralizedOptimum(DEFAULT_NEGOTIATION_CONFIG);
    expect(first).toEqual(second);
  });
});

describe("coordinationLoss", () => {
  it("reports full efficiency when chain profit equals the centralized optimum", () => {
    const { loss, efficiency } = coordinationLoss(126750, 126750);
    expect(loss).toBe(0);
    expect(efficiency).toBe(1);
  });

  it("reports the gap and a sub-1 efficiency for a worse-than-optimal outcome", () => {
    const { loss, efficiency } = coordinationLoss(100000, 126750);
    expect(loss).toBe(26750);
    expect(efficiency).toBeCloseTo(100000 / 126750, 10);
  });

  it("guards against dividing by a non-positive centralized profit", () => {
    expect(coordinationLoss(0, 0).efficiency).toBe(0);
  });
});

describe("batchSchedules — the Wagner-Whitin candidate set", () => {
  it("produces exactly 2^(n-1) candidates and every one sums to total demand", () => {
    const demand = DEFAULT_NEGOTIATION_CONFIG.monthlyDemand;
    const schedules = batchSchedules(demand);
    expect(schedules.length).toBe(2 ** (demand.length - 1));
    const total = demand.reduce((a, b) => a + b, 0);
    for (const schedule of schedules) {
      expect(schedule.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("always includes both named extremes", () => {
    const schedules = batchSchedules(DEFAULT_NEGOTIATION_CONFIG.monthlyDemand);
    expect(schedules).toContainEqual(LOT_FOR_LOT);
    expect(schedules).toContainEqual(CONSOLIDATED);
  });
});

describe("groupedSchedule — the bot's concession ladder", () => {
  it("is fully consolidated at groups=1 and lot-for-lot at groups=n", () => {
    expect(groupedSchedule(DEFAULT_NEGOTIATION_CONFIG, 1)).toEqual(consolidatedSchedule(DEFAULT_NEGOTIATION_CONFIG));
    expect(groupedSchedule(DEFAULT_NEGOTIATION_CONFIG, 4)).toEqual(lotForLotSchedule(DEFAULT_NEGOTIATION_CONFIG));
  });

  it("always sums to total demand, at every group count", () => {
    const total = DEFAULT_NEGOTIATION_CONFIG.monthlyDemand.reduce((a, b) => a + b, 0);
    for (let groups = 1; groups <= 4; groups++) {
      const schedule = groupedSchedule(DEFAULT_NEGOTIATION_CONFIG, groups);
      expect(schedule.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("clamps an out-of-range group count instead of throwing", () => {
    expect(groupedSchedule(DEFAULT_NEGOTIATION_CONFIG, 0)).toEqual(consolidatedSchedule(DEFAULT_NEGOTIATION_CONFIG));
    expect(groupedSchedule(DEFAULT_NEGOTIATION_CONFIG, 99)).toEqual(lotForLotSchedule(DEFAULT_NEGOTIATION_CONFIG));
  });
});

describe("feasibilityReport", () => {
  it("flags a short contract instead of silently under-delivering", () => {
    const report = feasibilityReport([750, 1500, 750, 1500], DEFAULT_NEGOTIATION_CONFIG); // 500 short in June
    expect(report.fullyCovered).toBe(false);
    expect(report.totalUnmet).toBe(500);
  });

  it("reports full coverage for lot-for-lot", () => {
    const report = feasibilityReport(LOT_FOR_LOT, DEFAULT_NEGOTIATION_CONFIG);
    expect(report.fullyCovered).toBe(true);
    expect(report.totalUnmet).toBe(0);
  });
});

describe("settleDyad", () => {
  it("gives both sides zero profit on NO_DEAL — the paper treats no contract as a real, valid outcome (p.5)", () => {
    const result = settleDyad("NO_DEAL", null, null, null, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.dealt).toBe(false);
    expect(result.retailer.profit).toBe(0);
    expect(result.wholesaler.profit).toBe(0);
    // The full horizon's demand is recorded as unmet, not silently dropped.
    expect(result.retailer.unmetDemand).toBe(5000);
  });

  it("auto-computes the wholesaler's optimal procurement when none was submitted yet", () => {
    const result = settleDyad("AGREED", 45, LOT_FOR_LOT, null, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.dealt).toBe(true);
    expect(result.procurementSchedule).toEqual([750, 2750, 0, 1500]);
    expect(result.wholesaler.profit).toBe(58500);
  });

  it("honors an explicitly-submitted procurement schedule even if it isn't the optimum", () => {
    const suboptimal = [5000, 0, 0, 0]; // legal, but not what optimalProcurement would pick
    const result = settleDyad("AGREED", 45, LOT_FOR_LOT, suboptimal, DEFAULT_NEGOTIATION_CONFIG);
    expect(result.procurementSchedule).toEqual(suboptimal);
    expect(result.wholesaler.profit).not.toBe(58500);
  });
});

describe("clampQuantities", () => {
  const cfg = DEFAULT_NEGOTIATION_CONFIG;

  it("pads a wrong-length or missing array with zeros rather than throwing", () => {
    expect(clampQuantities([100], cfg)).toEqual([100, 0, 0, 0]);
    expect(clampQuantities(undefined, cfg)).toEqual([0, 0, 0, 0]);
  });

  it("floors negative or non-numeric entries to zero", () => {
    expect(clampQuantities([-5, "abc", NaN, 200], cfg)).toEqual([0, 0, 0, 200]);
  });

  it("rounds fractional quantities and caps at maxMonthlyQty", () => {
    expect(clampQuantities([100.6, 200.4, 0, cfg.maxMonthlyQty + 500], cfg)).toEqual([
      101,
      200,
      0,
      cfg.maxMonthlyQty,
    ]);
  });
});

describe("clampPrice", () => {
  const cfg = DEFAULT_NEGOTIATION_CONFIG;

  it("floors a negative or non-numeric price to zero", () => {
    expect(clampPrice(-10, cfg)).toBe(0);
    expect(clampPrice("nonsense", cfg)).toBe(0);
  });

  it("caps at the retail price — a wholesaler can never legally ask more than the shelf price", () => {
    expect(clampPrice(cfg.retailPrice + 20, cfg)).toBe(cfg.retailPrice);
  });

  it("rounds to the nearest cent", () => {
    expect(clampPrice(45.678, cfg)).toBe(45.68);
  });
});

describe("clampNote", () => {
  const cfg = DEFAULT_NEGOTIATION_CONFIG;

  it("collapses whitespace and trims", () => {
    expect(clampNote("  We can   go\n\nlower  ", cfg)).toBe("We can go lower");
  });

  it("truncates at noteMaxLength", () => {
    const long = "x".repeat(cfg.noteMaxLength + 50);
    expect(clampNote(long, cfg)!.length).toBe(cfg.noteMaxLength);
  });

  it("turns blank or non-string input into null", () => {
    expect(clampNote("   ", cfg)).toBeNull();
    expect(clampNote(undefined, cfg)).toBeNull();
    expect(clampNote(42, cfg)).toBeNull();
  });

  it("returns null unconditionally when the host has turned notes off", () => {
    expect(clampNote("a perfectly good note", { ...cfg, allowNotes: false })).toBeNull();
  });
});

describe("shuffleSeeded", () => {
  it("returns a permutation of the input — same multiset, same length", () => {
    const items = ["a", "b", "c", "d", "e"];
    const shuffled = shuffleSeeded(items, 12345);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it("is stable for a fixed seed and differs across seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffleSeeded(items, 42)).toEqual(shuffleSeeded(items, 42));
    expect(shuffleSeeded(items, 42)).not.toEqual(shuffleSeeded(items, 43));
  });
});

describe("roundDeadlineFrom — the advisory round clock", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");

  it("is exactly start + roundMinutes", () => {
    const deadline = roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: 5 });
    expect(deadline).toEqual(new Date("2026-01-01T00:05:00.000Z"));
  });

  it("is null when no limit is configured", () => {
    expect(roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: null })).toBeNull();
  });

  it("is null for a non-positive limit rather than a deadline already in the past", () => {
    expect(roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: 0 })).toBeNull();
    expect(roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: -5 })).toBeNull();
  });

  it("is null for an absurd limit rather than an Invalid Date the DB will reject", () => {
    // The create form clamps roundMinutes to 1440, but this stays defensive
    // since a session's raw config JSON is another way an out-of-range
    // value could arrive here — 1e15 minutes overflows ECMAScript's valid
    // time-value range (±8.64e15 ms) well before it reaches Date.
    expect(roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: 1e15 })).toBeNull();
  });

  it("still resolves a large-but-valid limit to a real Date", () => {
    // 1440 minutes (24h) is the form's own ceiling — comfortably inside the
    // valid range, so this must NOT be swallowed by the same guard.
    const deadline = roundDeadlineFrom(start, { ...DEFAULT_NEGOTIATION_CONFIG, roundMinutes: 1440 });
    expect(deadline).toEqual(new Date("2026-01-02T00:00:00.000Z"));
  });
});
