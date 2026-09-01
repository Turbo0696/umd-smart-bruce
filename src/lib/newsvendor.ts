export type NewsvendorParams = {
  price: number;
  cost: number;
  salvage: number;
  demandMin: number;
  demandMax: number;
};

export type NewsvendorRoundResult = {
  demand: number;
  sold: number;
  leftover: number;
  shortage: number;
  profit: number;
};

// Uniform integer demand draw in [demandMin, demandMax], drawn once per
// round and applied identically to every participant so orders are
// compared against the same realized demand.
export function drawDemand(params: NewsvendorParams): number {
  const { demandMin, demandMax } = params;
  return demandMin + Math.floor(Math.random() * (demandMax - demandMin + 1));
}

export function resolveOrder(
  orderQty: number,
  demand: number,
  params: NewsvendorParams,
): NewsvendorRoundResult {
  const { price, cost, salvage } = params;
  const sold = Math.min(orderQty, demand);
  const leftover = Math.max(orderQty - demand, 0);
  const shortage = Math.max(demand - orderQty, 0);
  const profit = price * sold + salvage * leftover - cost * orderQty;

  return { demand, sold, leftover, shortage, profit };
}

// Classic newsvendor critical-ratio formula under uniform demand —
// shown at game end for teaching value, not used to grade players.
export function optimalOrderQty(params: NewsvendorParams): number {
  const { price, cost, salvage, demandMin, demandMax } = params;
  const criticalRatio = (price - cost) / (price - salvage);
  const clamped = Math.max(0, Math.min(1, criticalRatio));
  return Math.round(demandMin + clamped * (demandMax - demandMin));
}
