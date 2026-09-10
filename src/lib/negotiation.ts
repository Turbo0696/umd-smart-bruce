// Supply Chain Sourcing Game: an online adaptation of the classroom exercise
// in Gumus, M. & Love, E. C. (2013). "Supply Chain Sourcing Game: A
// Negotiation Exercise." Decision Sciences Journal of Innovative Education,
// 11(1), 3-12. DOI 10.1111/j.1540-4609.2012.00368.x.
//
// This is an independent implementation of the mechanics the paper
// describes — no text, figures, or code were taken from it. Default
// parameters mirror the paper's Figures 3-4 (a retailer facing four months
// of known demand, a wholesaler sourcing from an unlimited-supply
// manufacturer at a fixed price) and are host-editable on the create form.
//
// Unlike Bruce's other multiplayer games, a "round" here is a negotiation
// ATTEMPT over one contract covering the whole planning horizon — not a
// production period with its own payoff. Profit is computed once, at
// settlement, after an agreed (or absent) contract is known. The protocol
// itself is tightly prescribed by the paper (pp. 8-9): the retailer submits
// an RFQ; then in each round the wholesaler proposes a unit price and a
// monthly delivery schedule, and the retailer accepts or requests a
// revision; in the final round the retailer may only accept or reject.
//
// This module is the pure resolution engine: no Prisma, no React, no
// randomness beyond the seeded helpers at the bottom (used only to draw
// dyads and to seed the bot's stance, both deterministically).

export type NegotiationRole = "RETAILER" | "WHOLESALER";

export type NegotiationConfig = {
  horizonLabels: string[];
  monthlyDemand: number[]; // same length as horizonLabels — units known to the retailer in advance
  retailPrice: number; // $/unit to end-consumers (fixed)
  salvagePrice: number; // $/unit for retailer's leftover stock at the end of the horizon
  retailerOrderCost: number; // $ per order the retailer places with its wholesaler
  retailerHoldingCost: number; // $/unit/month, retailer's own inventory
  manufacturerCost: number; // $/unit the wholesaler pays its (unlimited-supply) manufacturer
  wholesalerOrderCost: number; // $ per order the wholesaler places with the manufacturer
  wholesalerHoldingCost: number; // $/unit/month, wholesaler's own inventory
  wholesalerSalvage: number; // $/unit for wholesaler's leftover stock (paper doesn't specify this; our default is 0)
  totalRounds: number; // k rounds of negotiation
  roundSeconds: number | null; // advisory per-round clock; there is no cron/realtime, so this is never enforced automatically — see negotiation-actions.ts
  allowDemandSharing: boolean; // lets the retailer reveal its demand schedule to the wholesaler
  allowNotes: boolean;
  noteMaxLength: number;
  maxMonthlyQty: number; // clamp on any single month's quantity, so a stray input can't blow up optimalProcurement's search
};

// The paper's Figures 3-4. Every value here is host-editable; these are our
// defaults, not a claim that the paper prescribes exactly these figures for
// every adopter — see the plan's fidelity note.
export const DEFAULT_NEGOTIATION_CONFIG: NegotiationConfig = {
  horizonLabels: ["May", "June", "July", "August"],
  monthlyDemand: [750, 2000, 750, 1500],
  retailPrice: 60,
  salvagePrice: 31,
  retailerOrderCost: 2000,
  retailerHoldingCost: 3,
  manufacturerCost: 30,
  wholesalerOrderCost: 5000,
  wholesalerHoldingCost: 2,
  wholesalerSalvage: 0,
  totalRounds: 3,
  roundSeconds: null,
  allowDemandSharing: true,
  allowNotes: true,
  noteMaxLength: 500,
  maxMonthlyQty: 20000,
};

// Exhaustive two-echelon lot-sizing search is O(2^(n-1) * 2^(n-1)); this caps
// it at a few thousand evaluations even at the ceiling. Session creation
// clamps the host's horizon to this length.
export const MAX_HORIZON_MONTHS = 12;

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function horizonLength(config: NegotiationConfig): number {
  return config.monthlyDemand.length;
}

// --- Clamping raw form/offer input ---

export function clampQuantities(raw: unknown, config: NegotiationConfig): number[] {
  const n = horizonLength(config);
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: n }, (_, i) => {
    const v = Number(arr[i]);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(Math.round(v), config.maxMonthlyQty);
  });
}

export function clampPrice(raw: unknown, config: NegotiationConfig): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(Math.min(v, config.retailPrice) * 100) / 100;
}

// Collapses all whitespace (so a note can't be used for ASCII art or to blow
// out the layout), trims, and caps length. Blank input becomes null so the UI
// never has to special-case an empty-but-present string.
export function clampNote(raw: unknown, config: NegotiationConfig): string | null {
  if (!config.allowNotes) return null;
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, config.noteMaxLength);
}

// --- Monthly settlement: deliveries against a demand-like stream ---
//
// No backlog: unmet demand in a month is simply lost, not carried forward.
// This one function is reused for both echelons — a wholesaler settling its
// own procurement against what it must ship out is the identical calculation
// as a retailer settling its deliveries against end-consumer demand.

export type MonthlySettlement = {
  sold: number[];
  unmet: number[];
  ending: number[];
};

export function settleMonths(supply: readonly number[], need: readonly number[]): MonthlySettlement {
  let inv = 0;
  const sold: number[] = [];
  const unmet: number[] = [];
  const ending: number[] = [];
  for (let t = 0; t < need.length; t++) {
    const available = inv + (supply[t] ?? 0);
    const s = Math.min(available, need[t]);
    sold.push(s);
    unmet.push(need[t] - s);
    inv = available - s;
    ending.push(inv);
  }
  return { sold, unmet, ending };
}

export type FeasibilityReport = MonthlySettlement & {
  totalUnmet: number;
  fullyCovered: boolean;
};

export function feasibilityReport(quantities: number[], config: NegotiationConfig): FeasibilityReport {
  const settlement = settleMonths(quantities, config.monthlyDemand);
  const totalUnmet = sum(settlement.unmet);
  return { ...settlement, totalUnmet, fullyCovered: totalUnmet === 0 };
}

// --- Profit for each side of an agreed (or partially-agreed) contract ---

export type RetailerSettlement = {
  unitsContracted: number;
  unitsSold: number;
  unmetDemand: number;
  endingInventory: number;
  revenue: number;
  goodsCost: number;
  orderingCost: number;
  holdingCost: number;
  salvageRevenue: number;
  profit: number;
  deliveryCount: number;
};

export function retailerSettlement(price: number, deliveries: number[], config: NegotiationConfig): RetailerSettlement {
  const { sold, unmet, ending } = settleMonths(deliveries, config.monthlyDemand);
  const unitsSold = sum(sold);
  const unmetDemand = sum(unmet);
  const unitsContracted = sum(deliveries);
  const deliveryCount = deliveries.filter((d) => d > 0).length;
  const endingInventory = ending[ending.length - 1] ?? 0;

  const revenue = config.retailPrice * unitsSold;
  const goodsCost = price * unitsContracted;
  const orderingCost = config.retailerOrderCost * deliveryCount;
  const holdingCost = config.retailerHoldingCost * sum(ending.map((e) => Math.max(e, 0)));
  const salvageRevenue = config.salvagePrice * Math.max(endingInventory, 0);
  const profit = revenue - goodsCost - orderingCost - holdingCost + salvageRevenue;

  return {
    unitsContracted,
    unitsSold,
    unmetDemand,
    endingInventory,
    revenue,
    goodsCost,
    orderingCost,
    holdingCost,
    salvageRevenue,
    profit,
    deliveryCount,
  };
}

export type WholesalerSettlement = {
  unitsProcured: number;
  unitsShipped: number;
  shortfall: number; // months where procurement fell short of the delivery obligation
  endingInventory: number;
  revenue: number;
  goodsCost: number;
  orderingCost: number;
  holdingCost: number;
  salvageRevenue: number;
  profit: number;
  procurementCount: number;
};

// The wholesaler's own "demand" is whatever it must deliver to the retailer.
// Revenue is on units actually shipped (== deliveries, unless the wholesaler
// under-procures — settleMonths degrades gracefully rather than going
// negative if that happens).
export function wholesalerSettlement(
  price: number,
  deliveriesToRetailer: number[],
  procurement: number[],
  config: NegotiationConfig,
): WholesalerSettlement {
  const { sold: shipped, unmet: shortfallByMonth, ending } = settleMonths(procurement, deliveriesToRetailer);
  const unitsShipped = sum(shipped);
  const shortfall = sum(shortfallByMonth);
  const unitsProcured = sum(procurement);
  const procurementCount = procurement.filter((q) => q > 0).length;
  const endingInventory = ending[ending.length - 1] ?? 0;

  const revenue = price * unitsShipped;
  const goodsCost = config.manufacturerCost * unitsProcured;
  const orderingCost = config.wholesalerOrderCost * procurementCount;
  const holdingCost = config.wholesalerHoldingCost * sum(ending.map((e) => Math.max(e, 0)));
  const salvageRevenue = config.wholesalerSalvage * Math.max(endingInventory, 0);
  const profit = revenue - goodsCost - orderingCost - holdingCost + salvageRevenue;

  return {
    unitsProcured,
    unitsShipped,
    shortfall,
    endingInventory,
    revenue,
    goodsCost,
    orderingCost,
    holdingCost,
    salvageRevenue,
    profit,
    procurementCount,
  };
}

// --- Lot-sizing: batch schedules and the exhaustive search over them ---
//
// For an uncapacitated lot-sizing problem with no backlog and linear holding
// cost, the optimum is always a "batch" schedule: every delivery/order month
// covers exactly the need up to (not including) the next order month, and
// inventory is drawn to zero right before the next order (Wagner-Whitin).
// So the full space of candidates worth searching is one schedule per subset
// of {1..n-1} (month 0 always receives an order, since demand can't be met
// otherwise) — 2^(n-1) of them. This is exhaustive and exact, not a
// heuristic: the true optimum is guaranteed to be among these candidates.

export function batchSchedules(need: readonly number[]): number[][] {
  const n = need.length;
  if (n === 0) return [[]];
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const schedules: number[][] = [];
  const combos = 1 << rest.length;
  for (let mask = 0; mask < combos; mask++) {
    const orderMonths = [0, ...rest.filter((_, i) => (mask & (1 << i)) !== 0)];
    const schedule = new Array(n).fill(0);
    for (let i = 0; i < orderMonths.length; i++) {
      const start = orderMonths[i];
      const end = i + 1 < orderMonths.length ? orderMonths[i + 1] : n;
      let total = 0;
      for (let t = start; t < end; t++) total += need[t];
      schedule[start] = total;
    }
    schedules.push(schedule);
  }
  return schedules;
}

export type LogisticsCost = {
  schedule: number[];
  cost: number;
  orders: number;
  endingInventory: number;
};

function logisticsCost(schedule: number[], need: readonly number[], orderCost: number, holdCost: number): LogisticsCost {
  const orders = schedule.filter((q) => q > 0).length;
  const { ending } = settleMonths(schedule, need);
  const holding = sum(ending.map((e) => Math.max(e, 0)));
  return { schedule, cost: orderCost * orders + holdCost * holding, orders, endingInventory: ending[ending.length - 1] ?? 0 };
}

// The two canonical schedules named in the paper's own narrative (p.7):
// the retailer's lot-for-lot preference, and the wholesaler's preference to
// consolidate everything into one month-1 shipment.
export function lotForLotSchedule(config: NegotiationConfig): number[] {
  return config.monthlyDemand.slice();
}

export function consolidatedSchedule(config: NegotiationConfig): number[] {
  const total = sum(config.monthlyDemand);
  return [total, ...new Array(horizonLength(config) - 1).fill(0)];
}

// Partitions the horizon into `groups` contiguous chunks (as equal in month
// count as possible) and delivers each chunk's total demand at its start.
// groups=1 is consolidatedSchedule; groups=n is lotForLotSchedule. Used as
// the bot wholesaler's concession ladder between those two extremes, and
// happens to match the shape of the paper's own sample RFQ (Fig. 6, which
// groups four months into two shipments) even though the paper's narrative
// text (p.7) states the retailer's actual cost-minimizing preference is
// lot-for-lot — we follow the narrative for what a rational retailer bot
// requests, and use this ladder only for the wholesaler's concessions.
export function groupedSchedule(config: NegotiationConfig, groups: number): number[] {
  const demand = config.monthlyDemand;
  const n = demand.length;
  const g = clamp(Math.round(groups), 1, n);
  const schedule = new Array(n).fill(0);
  const base = Math.floor(n / g);
  const extra = n % g;
  let t = 0;
  for (let i = 0; i < g; i++) {
    const size = base + (i < extra ? 1 : 0);
    let total = 0;
    for (let k = 0; k < size && t + k < n; k++) total += demand[t + k];
    schedule[t] = total;
    t += size;
  }
  return schedule;
}

// The wholesaler's cost-minimizing manufacturer procurement schedule given a
// required delivery obligation to its retailer. Exhaustive and exact (see
// batchSchedules above) — NOT simply "match the delivery schedule" (that's
// often suboptimal: consolidating a few procurement orders while holding a
// little inventory can beat ordering every month, or vice versa, depending
// on how the order-cost/holding-cost ratio compares to the delivery
// schedule's own batch sizes).
export function optimalProcurement(deliveries: number[], config: NegotiationConfig): LogisticsCost {
  let best: LogisticsCost | null = null;
  for (const schedule of batchSchedules(deliveries)) {
    const candidate = logisticsCost(schedule, deliveries, config.wholesalerOrderCost, config.wholesalerHoldingCost);
    if (!best || candidate.cost < best.cost) best = candidate;
  }
  return best!;
}

export type CentralizedOptimum = {
  deliverySchedule: number[];
  procurementSchedule: number[];
  profit: number;
  retailerLogisticsCost: number;
  wholesalerLogisticsCost: number;
};

// The paper's own comparison (p.10): "In a centralized supply chain where
// the retailer and wholesaler are vertically integrated, one can optimize
// the sourcing decisions and find the maximum profit for the system as a
// whole." Computed by exhausting every feasible (delivery, procurement)
// batch-schedule pair — 2^(n-1) x 2^(n-1) evaluations, exact for the reason
// given above batchSchedules. The negotiated wholesale price never appears
// here: it's a pure transfer within the integrated firm.
export function centralizedOptimum(config: NegotiationConfig): CentralizedOptimum {
  const totalQty = sum(config.monthlyDemand);
  const revenue = config.retailPrice * totalQty;
  const goodsCost = config.manufacturerCost * totalQty;

  let best: CentralizedOptimum | null = null;
  for (const delivery of batchSchedules(config.monthlyDemand)) {
    const rLog = logisticsCost(delivery, config.monthlyDemand, config.retailerOrderCost, config.retailerHoldingCost);
    const proc = optimalProcurement(delivery, config);
    const retailerSalvage = config.salvagePrice * Math.max(rLog.endingInventory, 0);
    const wholesalerSalvageAmt = config.wholesalerSalvage * Math.max(proc.endingInventory, 0);
    const profit = revenue - goodsCost - rLog.cost - proc.cost + retailerSalvage + wholesalerSalvageAmt;
    if (!best || profit > best.profit) {
      best = {
        deliverySchedule: delivery,
        procurementSchedule: proc.schedule,
        profit,
        retailerLogisticsCost: rLog.cost,
        wholesalerLogisticsCost: proc.cost,
      };
    }
  }
  return best!;
}

export function coordinationLoss(chainProfit: number, centralizedProfit: number): { loss: number; efficiency: number } {
  const loss = centralizedProfit - chainProfit;
  const efficiency = centralizedProfit > 0 ? chainProfit / centralizedProfit : 0;
  return { loss, efficiency };
}

// --- Settling one dyad's outcome, agreed or not ---

export type DyadSettlement = {
  dealt: boolean;
  procurementSchedule: number[] | null;
  retailer: RetailerSettlement;
  wholesaler: WholesalerSettlement;
};

// On NO_DEAL, the paper treats "no contract" as a real, valid outcome (p.5)
// rather than modeling lost-sales economics for either side — both simply
// get zero profit, and the retailer's full demand is recorded as unmet.
export function settleDyad(
  status: "AGREED" | "NO_DEAL",
  agreedPrice: number | null,
  agreedQuantities: number[] | null,
  procurementSchedule: number[] | null,
  config: NegotiationConfig,
): DyadSettlement {
  if (status !== "AGREED" || agreedPrice == null || !agreedQuantities) {
    return {
      dealt: false,
      procurementSchedule: null,
      retailer: {
        unitsContracted: 0,
        unitsSold: 0,
        unmetDemand: sum(config.monthlyDemand),
        endingInventory: 0,
        revenue: 0,
        goodsCost: 0,
        orderingCost: 0,
        holdingCost: 0,
        salvageRevenue: 0,
        profit: 0,
        deliveryCount: 0,
      },
      wholesaler: {
        unitsProcured: 0,
        unitsShipped: 0,
        shortfall: 0,
        endingInventory: 0,
        revenue: 0,
        goodsCost: 0,
        orderingCost: 0,
        holdingCost: 0,
        salvageRevenue: 0,
        profit: 0,
        procurementCount: 0,
      },
    };
  }

  const retailer = retailerSettlement(agreedPrice, agreedQuantities, config);
  const procurement = procurementSchedule ?? optimalProcurement(agreedQuantities, config).schedule;
  const wholesaler = wholesalerSettlement(agreedPrice, agreedQuantities, procurement, config);
  return { dealt: true, procurementSchedule: procurement, retailer, wholesaler };
}

// --- Deterministic seeding, used for the dyad draw and the bot's stance ---

export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG. Not cryptographic; fine for
// classroom randomization.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleSeeded<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
