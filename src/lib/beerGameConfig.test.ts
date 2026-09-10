// SPDX-License-Identifier: CC-BY-SA-4.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEER_CONFIG,
  DEFAULT_TOTAL_ROUNDS,
  TOTAL_ROUNDS_MAX,
  TOTAL_ROUNDS_MIN,
  clampTotalRounds,
  customerDemand,
  parseBeerConfig,
} from "@/lib/beerGameConfig";

describe("parseBeerConfig — defaults", () => {
  it("uses the classic Sterman parameters as defaults", () => {
    expect(DEFAULT_BEER_CONFIG).toMatchObject({
      holdingCost: 0.5,
      backorderCost: 1.0,
      initialInventory: 12,
      pipelineSeed: 4,
      demandInitial: 4,
      demandFinal: 8,
      demandStepRound: 5,
    });
  });

  it("falls back wholesale on anything that isn't an object", () => {
    for (const bad of [null, undefined, "config", 42, true, []]) {
      expect(parseBeerConfig(bad)).toEqual(DEFAULT_BEER_CONFIG);
    }
  });

  it("returns a fresh object so callers can't mutate the shared default", () => {
    const parsed = parseBeerConfig(null);
    parsed.holdingCost = 99;
    expect(DEFAULT_BEER_CONFIG.holdingCost).toBe(0.5);
  });
});

describe("parseBeerConfig — per-field resilience", () => {
  it("keeps good fields when a neighbour is garbage", () => {
    // A hand-edited or older config blob must never take a live session down.
    const parsed = parseBeerConfig({
      holdingCost: "not a number",
      backorderCost: 2.5,
    });
    expect(parsed.holdingCost).toBe(DEFAULT_BEER_CONFIG.holdingCost);
    expect(parsed.backorderCost).toBe(2.5);
  });

  it("ignores unknown keys", () => {
    const parsed = parseBeerConfig({ nonsense: true, holdingCost: 0.25 });
    expect(parsed.holdingCost).toBe(0.25);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(DEFAULT_BEER_CONFIG).sort());
  });

  it("falls back on NaN and Infinity", () => {
    expect(parseBeerConfig({ holdingCost: Number.NaN }).holdingCost).toBe(0.5);
    expect(parseBeerConfig({ holdingCost: Number.POSITIVE_INFINITY }).holdingCost).toBe(0.5);
  });
});

describe("parseBeerConfig — form values", () => {
  it("coerces numeric strings, as posted by the host's config form", () => {
    const parsed = parseBeerConfig({ holdingCost: "0.75", initialInventory: " 20 " });
    expect(parsed.holdingCost).toBe(0.75);
    expect(parsed.initialInventory).toBe(20);
  });

  it("treats an empty field as 'unchanged' rather than zero", () => {
    // Number("") is 0, which would silently wipe a cost to free.
    expect(parseBeerConfig({ holdingCost: "" }).holdingCost).toBe(0.5);
    expect(parseBeerConfig({ initialInventory: "   " }).initialInventory).toBe(12);
  });

  it("reads checkbox-style truthy strings", () => {
    expect(parseBeerConfig({ extraOrderDelay: "on" }).extraOrderDelay).toBe(true);
    expect(parseBeerConfig({ extraOrderDelay: "true" }).extraOrderDelay).toBe(true);
    expect(parseBeerConfig({ showUpstreamBacklog: "1" }).showUpstreamBacklog).toBe(true);
  });

  it("reads falsy strings as false", () => {
    expect(parseBeerConfig({ extraOrderDelay: "off" }).extraOrderDelay).toBe(false);
    expect(parseBeerConfig({ extraOrderDelay: "" }).extraOrderDelay).toBe(false);
  });

  it("passes real booleans through", () => {
    expect(parseBeerConfig({ extraOrderDelay: true }).extraOrderDelay).toBe(true);
    expect(parseBeerConfig({ extraOrderDelay: false }).extraOrderDelay).toBe(false);
  });
});

describe("parseBeerConfig — clamping", () => {
  it("refuses negative costs and inventories", () => {
    const parsed = parseBeerConfig({
      holdingCost: -5,
      backorderCost: -1,
      initialInventory: -20,
      pipelineSeed: -3,
    });
    expect(parsed.holdingCost).toBe(0);
    expect(parsed.backorderCost).toBe(0);
    expect(parsed.initialInventory).toBe(0);
    expect(parsed.pipelineSeed).toBe(0);
  });

  it("caps absurd values instead of letting them through", () => {
    expect(parseBeerConfig({ holdingCost: 10_000_000 }).holdingCost).toBe(1000);
    expect(parseBeerConfig({ initialInventory: 10_000_000 }).initialInventory).toBe(10_000);
  });

  it("rounds unit counts to whole units but leaves costs fractional", () => {
    expect(parseBeerConfig({ initialInventory: 12.7 }).initialInventory).toBe(13);
    expect(parseBeerConfig({ demandInitial: 4.4 }).demandInitial).toBe(4);
    expect(parseBeerConfig({ holdingCost: 0.35 }).holdingCost).toBe(0.35);
  });

  it("keeps demandStepRound at round 1 or later", () => {
    expect(parseBeerConfig({ demandStepRound: 0 }).demandStepRound).toBe(1);
    expect(parseBeerConfig({ demandStepRound: -4 }).demandStepRound).toBe(1);
  });
});

describe("clampTotalRounds", () => {
  it("defaults to the classic 40-round game", () => {
    expect(DEFAULT_TOTAL_ROUNDS).toBe(40);
    expect(clampTotalRounds(undefined)).toBe(40);
    expect(clampTotalRounds("nonsense")).toBe(40);
    expect(clampTotalRounds("")).toBe(40);
  });

  it("holds the round count inside playable bounds", () => {
    expect(clampTotalRounds(0)).toBe(TOTAL_ROUNDS_MIN);
    expect(clampTotalRounds(-10)).toBe(TOTAL_ROUNDS_MIN);
    expect(clampTotalRounds(99_999)).toBe(TOTAL_ROUNDS_MAX);
  });

  it("accepts a plain form string", () => {
    expect(clampTotalRounds("10")).toBe(10);
  });

  it("rounds to a whole number of rounds", () => {
    expect(clampTotalRounds(12.6)).toBe(13);
  });
});

describe("customerDemand", () => {
  it("steps from initial to final on the configured round", () => {
    const cfg = DEFAULT_BEER_CONFIG;
    expect(customerDemand(1, cfg)).toBe(4);
    expect(customerDemand(4, cfg)).toBe(4);
    expect(customerDemand(5, cfg)).toBe(8);
    expect(customerDemand(40, cfg)).toBe(8);
  });

  it("honours a custom step", () => {
    const cfg = { ...DEFAULT_BEER_CONFIG, demandInitial: 10, demandFinal: 2, demandStepRound: 3 };
    expect(customerDemand(2, cfg)).toBe(10);
    expect(customerDemand(3, cfg)).toBe(2);
  });
});
