export type BeerGameRole =
  | "RETAILER"
  | "WHOLESALER"
  | "DISTRIBUTOR"
  | "FACTORY";

export const ROLE_ORDER: BeerGameRole[] = [
  "RETAILER",
  "WHOLESALER",
  "DISTRIBUTOR",
  "FACTORY",
];

const HOLDING_COST_PER_UNIT = 0.5;
const BACKORDER_COST_PER_UNIT = 1.0;
const INITIAL_INVENTORY = 12;
const PIPELINE_SEED_SHIPMENT = 4;

// Classic Sterman/MIT step-function customer demand: 4/week, then 8/week
// from round 5 onward.
export function customerDemand(round: number): number {
  return round >= 5 ? 8 : 4;
}

// Who a role orders from (upstream) and who orders from it (downstream).
// undefined upstream/downstream means "customer" or "unlimited raw materials".
const DOWNSTREAM: Record<BeerGameRole, BeerGameRole | undefined> = {
  RETAILER: undefined,
  WHOLESALER: "RETAILER",
  DISTRIBUTOR: "WHOLESALER",
  FACTORY: "DISTRIBUTOR",
};
const UPSTREAM: Record<BeerGameRole, BeerGameRole | undefined> = {
  RETAILER: "WHOLESALER",
  WHOLESALER: "DISTRIBUTOR",
  DISTRIBUTOR: "FACTORY",
  FACTORY: undefined,
};

export type RoundStateByRole = Record<
  BeerGameRole,
  {
    round: number;
    inventory: number;
    backlog: number;
    shipped: number;
    outgoingOrder: number;
  }
>;

export type ResolvedRound = Record<
  BeerGameRole,
  {
    incomingOrder: number;
    incomingShipment: number;
    shipped: number;
    outgoingOrder: number;
    inventory: number;
    backlog: number;
    cost: number;
  }
>;

/**
 * Resolves round N given:
 * - history: a lookup from round number -> per-role state, for rounds < N
 *   (only needs to go back 2 rounds, but callers may pass more)
 * - orders: submitted outgoingOrder values for round N, keyed by role. A
 *   role with no entry has no human player (a short-handed team) and
 *   auto-orders exactly what it received that round — the standard
 *   "null strategy" bot rule.
 */
export function resolveRound(
  round: number,
  history: Map<number, RoundStateByRole>,
  orders: Partial<Record<BeerGameRole, number>>,
): ResolvedRound {
  const prior = history.get(round - 1);
  const twoAgo = history.get(round - 2);

  const result = {} as ResolvedRound;

  for (const role of ROLE_ORDER) {
    const priorInventory = prior?.[role]?.inventory ?? INITIAL_INVENTORY;
    const priorBacklog = prior?.[role]?.backlog ?? 0;

    // DOWNSTREAM always points to a role earlier in ROLE_ORDER, so its
    // result (and thus its final outgoingOrder — human-submitted or
    // bot-computed) is already resolved by the time we get here.
    const downstream = DOWNSTREAM[role];
    const incomingOrder = downstream
      ? result[downstream]!.outgoingOrder
      : customerDemand(round);

    let incomingShipment: number;
    if (round <= 2) {
      incomingShipment = PIPELINE_SEED_SHIPMENT;
    } else if (role === "FACTORY") {
      incomingShipment = twoAgo?.FACTORY?.outgoingOrder ?? PIPELINE_SEED_SHIPMENT;
    } else {
      const upstream = UPSTREAM[role]!;
      incomingShipment = twoAgo?.[upstream]?.shipped ?? PIPELINE_SEED_SHIPMENT;
    }

    const available = priorInventory + incomingShipment;
    const demand = incomingOrder + priorBacklog;
    const shipped = Math.min(available, demand);
    const backlog = demand - shipped;
    const inventory = available - shipped;
    const cost = HOLDING_COST_PER_UNIT * inventory + BACKORDER_COST_PER_UNIT * backlog;

    result[role] = {
      incomingOrder,
      incomingShipment,
      shipped,
      outgoingOrder: orders[role] ?? incomingOrder,
      inventory,
      backlog,
      cost,
    };
  }

  return result;
}
