"use client";

import { useState } from "react";
import { hashSeed, mulberry32, retailerSettlement, type NegotiationConfig } from "@/lib/negotiation";
import { DemandWarning } from "./DemandWarning";
import { MonthlyBreakdownTable } from "./MonthlyBreakdownTable";
import { submitRfq } from "./negotiation-actions";

// The RFQ form is interactive (unlike every other form in this game, which
// is a plain server-rendered <form>) because the point of this component is
// a live "what-if" estimate: the wholesale price isn't negotiated yet, so
// there's no single real number to show, only how profit would change under
// a price and a delivery schedule the retailer is free to experiment with.
// retailerSettlement is safe to import here — src/lib/negotiation.ts has no
// server-only dependencies (no Prisma, no Node builtins), so the exact same
// function the server settles the game with also runs in the browser.
export function RfqEstimator({
  slug,
  sessionId,
  dyadId,
  config,
}: {
  slug: string;
  sessionId: string;
  dyadId: string;
  config: NegotiationConfig;
}) {
  const action = submitRfq.bind(null, slug, sessionId);
  // "" is a real, distinct state from 0 — it's what a cell looks like while
  // the field is empty (e.g. mid-backspace), so the box can actually go
  // blank instead of snapping back to a displayed "0" on every keystroke.
  // Computations below always fall back to 0 for "", so an unfinished edit
  // never breaks the live estimate; the server treats a blank submission as
  // 0 too (clampQuantities), so nothing downstream needs to know about "".
  const [quantities, setQuantities] = useState<Array<number | "">>(() => [...config.monthlyDemand]);
  // The retailer knows retailPrice and salvagePrice (both common knowledge)
  // but not the wholesaler's cost, so a starting guess anywhere in that
  // known range is defensible — a fixed midpoint just risked reading as a
  // "here's the fair price" hint. Seeded (not Math.random()) so the server's
  // first render and the client's hydration compute the identical number —
  // same hashSeed+mulberry32 pattern the bot profiles already use — while
  // still landing on a different spot per dyad rather than one shared value
  // every retailer sees.
  const [price, setPrice] = useState<number | "">(() => {
    const t = mulberry32(hashSeed(sessionId, dyadId, "hypothetical-price"))();
    return Math.round((config.salvagePrice + t * (config.retailPrice - config.salvagePrice)) * 100) / 100;
  });

  const numericQuantities = quantities.map((q) => (q === "" ? 0 : q));
  const numericPrice = price === "" ? 0 : price;
  const estimate = retailerSettlement(numericPrice, numericQuantities, config);

  function updateQuantity(i: number, raw: string) {
    const next: number | "" = raw === "" ? "" : Math.max(0, Math.round(Number(raw) || 0));
    setQuantities((prev) => prev.map((v, idx) => (idx === i ? next : v)));
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        You know your own demand for the months ahead. Request however you&apos;d
        like it delivered — it doesn&apos;t have to match your demand exactly,
        but ordering more often costs more in ordering fees, and holding
        stock ahead of when you need it costs you in storage.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      <div className="rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Try a hypothetical wholesale price — the real price is still up for
          negotiation, this just lets you see how different outcomes would
          affect you
          <input
            type="number"
            min={0}
            max={config.retailPrice}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <EstimateStat label="Units likely sold" value={estimate.unitsSold} />
          <EstimateStat label="Ordering cost" value={`$${estimate.orderingCost.toLocaleString()}`} />
          <EstimateStat label="Holding cost" value={`$${estimate.holdingCost.toLocaleString()}`} />
          <EstimateStat
            label="Estimated profit"
            value={`$${Math.round(estimate.profit).toLocaleString()}`}
            emphasize
          />
        </div>

        <DemandWarning units={estimate.unmetDemand}>
          {estimate.unmetDemand} unit{estimate.unmetDemand === 1 ? "" : "s"} of your own demand would
          go unmet with this schedule — that&apos;s lost sales you won&apos;t get back.
        </DemandWarning>

        <MonthlyBreakdownTable
          horizonLabels={config.horizonLabels}
          need={config.monthlyDemand}
          supply={numericQuantities}
          needLabel="Your demand"
          supplyLabel="You'd request"
        />

        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Only an estimate at the price you just typed — it updates as you
          change either number, but the price you&apos;ll actually get is
          whatever you and your wholesaler agree to.
        </p>
      </div>

      {config.allowDemandSharing && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="shareDemand" />
          Share my actual monthly demand with my wholesaler
        </label>
      )}
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Submit RFQ
      </button>
    </form>
  );
}

function EstimateStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className={emphasize ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-900 dark:text-zinc-50"}>
        {value}
      </p>
    </div>
  );
}
