"use client";

import { useState } from "react";
import { retailerSettlement, type NegotiationConfig } from "@/lib/negotiation";
import { DemandWarning } from "./DemandWarning";
import { MonthlyBreakdownTable } from "./MonthlyBreakdownTable";

// Nested inside ResponseForm's server-rendered <form> in NegotiationSession.tsx
// — the enclosing form still submits through the same submitResponse action;
// this only needs to be a client component because the live estimate has to
// recompute as the retailer types a counter-offer, which a plain
// server-rendered <input> can't do. The name= attributes (requestedPrice,
// qty-N) are unchanged, so submitResponse's formData.get(...) calls don't
// need to know or care that these particular inputs are client-rendered —
// a <form> collects every named field in its DOM subtree regardless of
// which component rendered it.
export function ReviseEstimator({
  config,
  initialPrice,
  initialQuantities,
}: {
  config: NegotiationConfig;
  initialPrice: number | null;
  initialQuantities: number[];
}) {
  // "" is a real, distinct state from 0 — a cell mid-backspace should look
  // blank, not snap back to a displayed "0" on every keystroke. Both fall
  // back to 0 for the live estimate below, and the server treats a blank
  // submission as 0 too (clampPrice/clampQuantities), so "" never needs to
  // survive past this component.
  const [price, setPrice] = useState<number | "">(() => initialPrice ?? config.retailPrice / 2);
  const [quantities, setQuantities] = useState<Array<number | "">>(() => [...initialQuantities]);

  const numericPrice = price === "" ? 0 : price;
  const numericQuantities = quantities.map((q) => (q === "" ? 0 : q));
  const estimate = retailerSettlement(numericPrice, numericQuantities, config);

  function updateQuantity(i: number, raw: string) {
    const next: number | "" = raw === "" ? "" : Math.max(0, Math.round(Number(raw) || 0));
    setQuantities((prev) => prev.map((v, idx) => (idx === i ? next : v)));
  }

  return (
    <>
      <label className="mt-2 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Unit price ($)
        <input
          type="number"
          name="requestedPrice"
          min={0}
          max={config.retailPrice}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {config.horizonLabels.map((label, i) => (
          <label key={label} className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            {label}{" "}
            <span className="text-zinc-400 dark:text-zinc-500">(your demand: {config.monthlyDemand[i]})</span>
            <input
              type="number"
              name={`qty-${i}`}
              min={0}
              step={1}
              value={quantities[i]}
              onChange={(e) => updateQuantity(i, e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        ))}
      </div>

      <DemandWarning units={estimate.unmetDemand}>
        {estimate.unmetDemand} unit{estimate.unmetDemand === 1 ? "" : "s"} of your own demand would go
        unmet if they agree to this — that&apos;s lost sales you won&apos;t get back.
      </DemandWarning>

      <MonthlyBreakdownTable
        horizonLabels={config.horizonLabels}
        need={config.monthlyDemand}
        supply={numericQuantities}
        needLabel="Your demand"
        supplyLabel="You'd ask for"
      />

      <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-zinc-500 dark:text-zinc-500">Units likely sold</p>
          <p className="text-zinc-900 dark:text-zinc-50">{estimate.unitsSold}</p>
        </div>
        <div>
          <p className="text-zinc-500 dark:text-zinc-500">Ordering + holding cost</p>
          <p className="text-zinc-900 dark:text-zinc-50">
            ${(estimate.orderingCost + estimate.holdingCost).toLocaleString()}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-zinc-500 dark:text-zinc-500">Estimated profit if they agree to this</p>
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
            ${Math.round(estimate.profit).toLocaleString()}
          </p>
        </div>
      </div>
    </>
  );
}
