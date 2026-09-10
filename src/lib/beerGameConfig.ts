// SPDX-License-Identifier: CC-BY-SA-4.0
//
// The host-tunable knobs are modelled on siemsene/beergame's `GameConfig`
// (src/logic/gameModel.ts), including its two optional session features:
// an extra order delay and upstream-backlog visibility.
// See NOTICE.md for attribution.

// Stored in GameSession.config (already a Json? column), except for the round
// count, which keeps using the existing GameSession.totalRounds column rather
// than being duplicated into the blob.
export type BeerGameConfig = {
  holdingCost: number;
  backorderCost: number;
  initialInventory: number;
  /** Units already in transit at every stage when the game opens. */
  pipelineSeed: number;
  demandInitial: number;
  demandFinal: number;
  /** First round on which demand switches from initial to final. */
  demandStepRound: number;
  /**
   * Off: an order placed in round t is visible upstream in round t (shipping
   * still takes 2). On: it isn't seen until t+1, so the chain has a longer
   * information lag and the bullwhip is sharper.
   */
  extraOrderDelay: boolean;
  /** Show each player the backlog their upstream partner is carrying. */
  showUpstreamBacklog: boolean;
};

// Classic Sterman/MIT parameters: 12 on hand, 4/week in the pipeline, demand
// steps 4 -> 8 at round 5, $0.50 to hold a unit and $1.00 to owe one.
export const DEFAULT_BEER_CONFIG: BeerGameConfig = {
  holdingCost: 0.5,
  backorderCost: 1.0,
  initialInventory: 12,
  pipelineSeed: 4,
  demandInitial: 4,
  demandFinal: 8,
  demandStepRound: 5,
  extraOrderDelay: false,
  showUpstreamBacklog: false,
};

export const TOTAL_ROUNDS_MIN = 1;
export const TOTAL_ROUNDS_MAX = 200;
export const DEFAULT_TOTAL_ROUNDS = 40;

/**
 * Orders at or above this get a client-side "did you mean that?" confirm.
 * From siemsene's release notes: "Sometimes, players accidentally double-tap
 * a key." Not a hard cap — a player who means 80 can still submit 80.
 */
export const LARGE_ORDER_CONFIRM_THRESHOLD = 50;

type Bounds = { min: number; max: number; integer?: boolean };

const BOUNDS: Record<keyof Omit<BeerGameConfig, "extraOrderDelay" | "showUpstreamBacklog">, Bounds> = {
  holdingCost: { min: 0, max: 1000 },
  backorderCost: { min: 0, max: 1000 },
  initialInventory: { min: 0, max: 10_000, integer: true },
  pipelineSeed: { min: 0, max: 10_000, integer: true },
  demandInitial: { min: 0, max: 10_000, integer: true },
  demandFinal: { min: 0, max: 10_000, integer: true },
  demandStepRound: { min: 1, max: TOTAL_ROUNDS_MAX, integer: true },
};

function clampNumber(raw: unknown, fallback: number, bounds: Bounds): number {
  // Accepts strings so the same parser handles both a JSON blob read back from
  // Postgres and raw FormData values off the host's config form.
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // An empty number input posts "", which Number() would read as 0. Falling
    // back to the default is far less surprising than silently zeroing a cost.
    if (trimmed === "") return fallback;
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(Math.max(value, bounds.min), bounds.max);
  return bounds.integer ? Math.round(clamped) : clamped;
}

function coerceBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  // HTML checkboxes post "on" (or the value attribute) only when checked.
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (["true", "on", "1", "yes"].includes(v)) return true;
    if (["false", "off", "0", "no", ""].includes(v)) return false;
  }
  return fallback;
}

/**
 * Field-by-field parse with per-field fallback, so a hand-edited blob, a
 * config written by an older version of this code, or a stray null can never
 * take a live session down — the worst case is a field reverting to default.
 */
export function parseBeerConfig(raw: unknown): BeerGameConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_BEER_CONFIG };
  }
  const src = raw as Record<string, unknown>;

  const config: BeerGameConfig = {
    holdingCost: clampNumber(src.holdingCost, DEFAULT_BEER_CONFIG.holdingCost, BOUNDS.holdingCost),
    backorderCost: clampNumber(src.backorderCost, DEFAULT_BEER_CONFIG.backorderCost, BOUNDS.backorderCost),
    initialInventory: clampNumber(src.initialInventory, DEFAULT_BEER_CONFIG.initialInventory, BOUNDS.initialInventory),
    pipelineSeed: clampNumber(src.pipelineSeed, DEFAULT_BEER_CONFIG.pipelineSeed, BOUNDS.pipelineSeed),
    demandInitial: clampNumber(src.demandInitial, DEFAULT_BEER_CONFIG.demandInitial, BOUNDS.demandInitial),
    demandFinal: clampNumber(src.demandFinal, DEFAULT_BEER_CONFIG.demandFinal, BOUNDS.demandFinal),
    demandStepRound: clampNumber(src.demandStepRound, DEFAULT_BEER_CONFIG.demandStepRound, BOUNDS.demandStepRound),
    extraOrderDelay: coerceBoolean(src.extraOrderDelay, DEFAULT_BEER_CONFIG.extraOrderDelay),
    showUpstreamBacklog: coerceBoolean(src.showUpstreamBacklog, DEFAULT_BEER_CONFIG.showUpstreamBacklog),
  };

  return config;
}

export function clampTotalRounds(raw: unknown): number {
  return clampNumber(raw, DEFAULT_TOTAL_ROUNDS, {
    min: TOTAL_ROUNDS_MIN,
    max: TOTAL_ROUNDS_MAX,
    integer: true,
  });
}

/** Exogenous end-customer demand facing the retailer in a given round. */
export function customerDemand(round: number, config: BeerGameConfig): number {
  return round >= config.demandStepRound ? config.demandFinal : config.demandInitial;
}
