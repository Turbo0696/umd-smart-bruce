"use client";

import { useState } from "react";
import { optimalProcurement, wholesalerSettlement, type NegotiationConfig } from "@/lib/negotiation";
import { submitProposal } from "./negotiation-actions";

// Mirrors RfqEstimator's shape for the wholesaler's side: a live estimate as
// they adjust price and delivery quantities, since neither is settled yet.
// The one thing this can't show for certain is procurement cost — that's a
// SETTLEMENT-stage decision the wholesaler hasn't made — so this assumes
// optimalProcurement's cost-minimizing schedule as a best case, labeled as
// such, using the same function the game itself falls back to if a
// wholesaler never submits one (see settleDyad in negotiation.ts).
export function ProposalEstimator({
  slug,
  sessionId,
  config,
  rfqQuantities,
  lastRequestedPrice,
  lastRequestedQuantities,
}: {
  slug: string;
  sessionId: string;
  config: NegotiationConfig;
  rfqQuantities: number[] | null;
  lastRequestedPrice: number | null;
  lastRequestedQuantities: number[] | null;
}) {
  const action = submitProposal.bind(null, slug, sessionId);
  const [quantities, setQuantities] = useState<number[]>(
    () => [...(lastRequestedQuantities ?? rfqQuantities ?? config.monthlyDemand)],
  );
  const [price, setPrice] = useState<number>(
    () => lastRequestedPrice ?? Math.round(((config.manufacturerCost + config.retailPrice) / 2) * 100) / 100,
  );

  const procurement = optimalProcurement(quantities, config);
  const estimate = wholesalerSettlement(price, quantities, procurement.schedule, config);

  function updateQuantity(i: number, raw: string) {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    setQuantities((prev) => prev.map((v, idx) => (idx === i ? n : v)));
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Propose a price and delivery schedule
      </p>
      {rfqQuantities && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Your retailer&apos;s request: {rfqQuantities.join(", ")} units
        </p>
      )}
      {lastRequestedPrice != null && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Last round they asked for ${lastRequestedPrice.toFixed(2)}/unit
          {lastRequestedQuantities ? ` and ${lastRequestedQuantities.join(", ")} units` : ""}.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Unit price ($, up to ${config.retailPrice})
        <input
          type="number"
          name="price"
          min={0}
          max={config.retailPrice}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {config.horizonLabels.map((label, i) => (
          <label key={label} className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            {label}
            <input
              type="number"
              name={`qty-${i}`}
              min={0}
              step={1}
              value={quantities[i] ?? 0}
              onChange={(e) => updateQuantity(i, e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        ))}
      </div>

      <div className="rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <EstimateStat label="Units you'd ship" value={estimate.unitsShipped} />
          <EstimateStat label="Goods cost" value={`$${estimate.goodsCost.toLocaleString()}`} />
          <EstimateStat
            label="Best-case order + holding cost"
            value={`$${(estimate.orderingCost + estimate.holdingCost).toLocaleString()}`}
          />
          <EstimateStat
            label="Estimated profit"
            value={`$${Math.round(estimate.profit).toLocaleString()}`}
            emphasize
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Assumes you procure from your manufacturer in the cheapest way
          possible for this schedule — your actual procurement choice
          happens later, once a price is agreed, and could cost more if you
          don&apos;t optimize it.
        </p>
      </div>

      {config.allowNotes && <ProposalNoteField maxLength={config.noteMaxLength} />}
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Send proposal
      </button>
    </form>
  );
}

function ProposalNoteField({ maxLength }: { maxLength: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      Note (optional)
      <textarea
        name="note"
        maxLength={maxLength}
        rows={2}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
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
