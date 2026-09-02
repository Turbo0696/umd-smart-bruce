// Fish Banks: a simplified version of MIT's "Fishbanks, Ltd." system
// dynamics simulation (Dennis Meadows / Sloan School). Teams run
// competing fishing companies drawing from two shared, regenerating fish
// stocks (a nearby coastal zone and a further deep-sea zone). Every
// round each team decides how many ships to send to each zone and
// whether to build or scrap ships; the shared stock regrows logistically
// and is drawn down by everyone's combined catch, and the market price
// rises as the industry's total catch gets scarcer. Left unchecked, the
// "tragedy of the commons" collapses the stock — the same lesson the
// real MIT exercise teaches.
//
// This module is the pure resolution engine, shared by both the
// classroom (multiplayer, Prisma-backed) game and the solo-vs-AI
// (client-only) game so the two never drift apart on the rules.

export type Zone = "COASTAL" | "DEEP_SEA";

export type FishBanksConfig = {
  totalRounds: number;
  startingCash: number;
  startingShips: number;

  coastalCapacity: number; // carrying capacity K (tons)
  deepSeaCapacity: number;
  startingCoastalStock: number;
  startingDeepSeaStock: number;
  coastalGrowthRate: number; // logistic growth rate r (per round)
  deepSeaGrowthRate: number;

  coastalCatchability: number; // tons/ship-round per ton of stock, before the per-ship cap
  deepSeaCatchability: number;
  maxCatchPerShipCoastal: number; // hold capacity: hard cap per ship, tons/round
  maxCatchPerShipDeepSea: number;

  costPerShipCoastal: number; // operating cost, $/ship/round
  costPerShipDeepSea: number; // deep sea costs more to run than coastal
  shipBuildCost: number; // $ to add one new ship, available immediately
  shipScrapValue: number; // $ recovered per ship scrapped (also used as liquidation value)

  basePrice: number; // $/ton when industry catch == referenceCatch
  referenceCatch: number; // tons/round considered "normal" supply
  minPrice: number;
  maxPrice: number;

  interestRate: number; // per round, credited on each team's cash balance
};

export const DEFAULT_CONFIG: FishBanksConfig = {
  totalRounds: 15,
  startingCash: 4000,
  startingShips: 3,

  coastalCapacity: 500,
  deepSeaCapacity: 1500,
  startingCoastalStock: 400,
  startingDeepSeaStock: 1200,
  coastalGrowthRate: 0.35,
  deepSeaGrowthRate: 0.25,

  coastalCatchability: 0.06,
  deepSeaCatchability: 0.03,
  maxCatchPerShipCoastal: 25,
  maxCatchPerShipDeepSea: 35,

  costPerShipCoastal: 50,
  costPerShipDeepSea: 110,
  shipBuildCost: 500,
  shipScrapValue: 250,

  basePrice: 20,
  referenceCatch: 300,
  minPrice: 8,
  maxPrice: 100,

  interestRate: 0.04,
};

export type ZoneParams = {
  capacity: number;
  growthRate: number;
  catchability: number;
  maxCatchPerShip: number;
  costPerShip: number;
};

function zoneParams(zone: Zone, config: FishBanksConfig): ZoneParams {
  return zone === "COASTAL"
    ? {
        capacity: config.coastalCapacity,
        growthRate: config.coastalGrowthRate,
        catchability: config.coastalCatchability,
        maxCatchPerShip: config.maxCatchPerShipCoastal,
        costPerShip: config.costPerShipCoastal,
      }
    : {
        capacity: config.deepSeaCapacity,
        growthRate: config.deepSeaGrowthRate,
        catchability: config.deepSeaCatchability,
        maxCatchPerShip: config.maxCatchPerShipDeepSea,
        costPerShip: config.costPerShipDeepSea,
      };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Catch is density-dependent (catchability * stock), capped by each
// ship's hold capacity. All ships fishing the same zone in the same
// round face the same stock, so they get the same realized
// catch-per-ship — crowding is modeled by capping the zone's total catch
// at 95% of the standing stock and spreading that across every ship
// sent, which is what actually produces the "too many boats chasing too
// few fish" effect.
export function catchInZone(
  totalShips: number,
  stock: number,
  zone: Zone,
  config: FishBanksConfig,
): { catchPerShip: number; totalCatch: number } {
  if (totalShips <= 0 || stock <= 0) {
    return { catchPerShip: 0, totalCatch: 0 };
  }
  const { catchability, maxCatchPerShip } = zoneParams(zone, config);
  const uncappedPerShip = catchability * stock;
  const perShip = Math.min(uncappedPerShip, maxCatchPerShip);
  const rawTotal = perShip * totalShips;
  const totalCatch = Math.min(rawTotal, stock * 0.95);
  return { catchPerShip: totalCatch / totalShips, totalCatch };
}

// Discrete logistic regrowth applied AFTER that round's harvest is
// removed, so the stock can never regrow past what actually survived
// the season.
export function growStock(
  stockAfterHarvest: number,
  zone: Zone,
  config: FishBanksConfig,
): number {
  const { capacity, growthRate } = zoneParams(zone, config);
  if (stockAfterHarvest <= 0) return 0;
  const growth =
    growthRate * stockAfterHarvest * (1 - stockAfterHarvest / capacity);
  return Math.max(0, stockAfterHarvest + growth);
}

// Unit-elastic demand curve: price * quantity holds roughly constant
// around basePrice * referenceCatch, so price climbs sharply as the
// industry's combined catch dries up (scarcity) and sinks toward the
// floor when the industry is flooding the market.
export function priceFromCatch(
  totalIndustryCatch: number,
  config: FishBanksConfig,
): number {
  if (totalIndustryCatch <= 0) return config.maxPrice;
  const raw = (config.basePrice * config.referenceCatch) / totalIndustryCatch;
  return clamp(raw, config.minPrice, config.maxPrice);
}

export type TeamDecision = {
  shipsCoastal: number;
  shipsDeepSea: number;
  buildShips: number;
  scrapShips: number;
};

export type TeamStateBefore = {
  id: string;
  cash: number;
  ships: number;
  decision: TeamDecision;
};

export type TeamRoundOutcome = {
  id: string;
  shipsCoastal: number;
  shipsDeepSea: number;
  shipsBuilt: number;
  shipsScrapped: number;
  catchCoastal: number;
  catchDeepSea: number;
  revenue: number;
  operatingCost: number;
  buildCost: number;
  scrapRevenue: number;
  interest: number;
  profit: number;
  cash: number; // ending cash balance
  ships: number; // ending fleet size
  netWorth: number; // ending cash + fleet at scrap/liquidation value
};

export type MarketRoundOutcome = {
  coastalStock: number; // stock remaining after this round's harvest + regrowth
  deepSeaStock: number;
  price: number;
  totalCatch: number;
};

export type RoundOutcome = {
  teams: TeamRoundOutcome[];
  market: MarketRoundOutcome;
};

// Clamps a team's raw decision against what they can actually afford /
// own, so a bad or stale submission can never send the sim negative.
// Ships built this round are available immediately; ships scrapped this
// round are removed before allocation.
export function clampDecision(
  decision: TeamDecision,
  ownedShips: number,
  cash: number,
  config: FishBanksConfig,
): TeamDecision {
  const scrapShips = clamp(Math.round(decision.scrapShips || 0), 0, ownedShips);
  const afterScrap = ownedShips - scrapShips;

  const maxAffordableBuilds =
    decision.buildShips > 0 ? Math.floor(Math.max(0, cash) / config.shipBuildCost) : 0;
  const buildShips = clamp(
    Math.round(decision.buildShips || 0),
    0,
    maxAffordableBuilds,
  );

  const fleetAvailable = afterScrap + buildShips;
  let shipsCoastal = Math.max(0, Math.round(decision.shipsCoastal || 0));
  let shipsDeepSea = Math.max(0, Math.round(decision.shipsDeepSea || 0));
  const requested = shipsCoastal + shipsDeepSea;
  if (requested > fleetAvailable && requested > 0) {
    const scale = fleetAvailable / requested;
    shipsCoastal = Math.floor(shipsCoastal * scale);
    shipsDeepSea = Math.floor(shipsDeepSea * scale);
  }

  return { shipsCoastal, shipsDeepSea, buildShips, scrapShips };
}

// Resolves one full round: every team's decision against the shared
// stock, in one shot (needed because zone-wide catch-per-ship depends on
// every team's effort in that zone).
export function resolveFishBanksRound(
  teams: TeamStateBefore[],
  coastalStock: number,
  deepSeaStock: number,
  config: FishBanksConfig,
): RoundOutcome {
  const clamped = teams.map((t) => ({
    ...t,
    decision: clampDecision(t.decision, t.ships, t.cash, config),
  }));

  const totalCoastalShips = clamped.reduce(
    (sum, t) => sum + t.decision.shipsCoastal,
    0,
  );
  const totalDeepSeaShips = clamped.reduce(
    (sum, t) => sum + t.decision.shipsDeepSea,
    0,
  );

  const coastal = catchInZone(totalCoastalShips, coastalStock, "COASTAL", config);
  const deepSea = catchInZone(totalDeepSeaShips, deepSeaStock, "DEEP_SEA", config);
  const totalIndustryCatch = coastal.totalCatch + deepSea.totalCatch;
  const price = priceFromCatch(totalIndustryCatch, config);

  const teamOutcomes: TeamRoundOutcome[] = clamped.map((t) => {
    const { shipsCoastal, shipsDeepSea, buildShips, scrapShips } = t.decision;
    const catchCoastal = coastal.catchPerShip * shipsCoastal;
    const catchDeepSea = deepSea.catchPerShip * shipsDeepSea;
    const revenue = price * (catchCoastal + catchDeepSea);
    const operatingCost =
      config.costPerShipCoastal * shipsCoastal +
      config.costPerShipDeepSea * shipsDeepSea;
    const buildCost = config.shipBuildCost * buildShips;
    const scrapRevenue = config.shipScrapValue * scrapShips;
    const interest = t.cash * config.interestRate;
    const profit = revenue - operatingCost - buildCost + scrapRevenue + interest;
    const cash = t.cash + profit;
    const ships = t.ships - scrapShips + buildShips;
    const netWorth = cash + ships * config.shipScrapValue;

    return {
      id: t.id,
      shipsCoastal,
      shipsDeepSea,
      shipsBuilt: buildShips,
      shipsScrapped: scrapShips,
      catchCoastal,
      catchDeepSea,
      revenue,
      operatingCost,
      buildCost,
      scrapRevenue,
      interest,
      profit,
      cash,
      ships,
      netWorth,
    };
  });

  const coastalAfterHarvest = Math.max(0, coastalStock - coastal.totalCatch);
  const deepSeaAfterHarvest = Math.max(0, deepSeaStock - deepSea.totalCatch);

  return {
    teams: teamOutcomes,
    market: {
      coastalStock: growStock(coastalAfterHarvest, "COASTAL", config),
      deepSeaStock: growStock(deepSeaAfterHarvest, "DEEP_SEA", config),
      price,
      totalCatch: totalIndustryCatch,
    },
  };
}
