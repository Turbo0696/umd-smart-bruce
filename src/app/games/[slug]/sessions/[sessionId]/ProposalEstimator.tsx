"use client";

import { useState } from "react";
import { optimalProcurement, settleMonths, wholesalerSettlement, type NegotiationConfig } from "@/lib/negotiation";
import { DemandWarning } from "./DemandWarning";
import { MonthlyBreakdownTable } from "./MonthlyBreakdownTable";
import { submitProposal } from "./negotiation-actions";

// Mirrors RfqEstimator's shape for the wholesaler's side: a live estimate as
// they adjust price and delivery quantities, since neither is settled yet.
// The one thing this can't show for certain is procurement cost — that's a
// SETTLEMENT-stage decision the wholesaler hasn't made — so this assumes
// optimalProcurement's cost-minimizing schedule as a best case, labeled as
// such, using the same function the game itself falls back to if a
// wholesaler never submits one (see settleDyad in negotiation.ts).
//
// The price field starts blank on purpose — no computed "fair" starting
// number. Suggesting one would hand the wholesaler an app-picked anchor
// instead of making them decide what to offer; the retailer's actual last
// ask is still shown as plain text above, just not pre-loaded into the box.
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
  // "" is a real, distinct state from 0 — a cell mid-backspace should look
  // blank, not snap back to a displayed "0" on every keystroke. Every
  // computation below falls back to 0 for "", and the server treats a blank
  // submission as 0 too (clampQuantities), so nothing downstream needs to
  // know "" ever existed.
  const [quantities, setQuantities] = useState<Array<number | "">>(
    () => [...(lastRequestedQuantities ?? rfqQuantities ?? config.monthlyDemand)],
  );
  const [price, setPrice] = useState<number | "">("");

  const numericQuantities = quantities.map((q) => (q === "" ? 0 : q));
  const procurement = optimalProcurement(numericQuantities, config);
  const estimate =
    price === "" ? null : wholesalerSettlement(price, numericQuantities, procurement.schedule, config);
  // How short this schedule falls of what the retailer actually asked for,
  // month by month — not the wholesaler's own logistics shortfall (that's
  // `estimate.shortfall`, procurement vs. delivery), but the consequence one
  // level downstream: can this schedule even cover the retailer's request.
  const askShortfall = rfqQuantities
    ? settleMonths(numericQuantities, rfqQuantities).unmet.reduce((a, b) => a + b, 0)
    : 0;

  function updateQuantity(i: number, raw: string) {
    const next: number | "" = raw === "" ? "" : Math.max(0, Math.round(Number(raw) || 0));
    setQuantities((prev) => prev.map((v, idx) => (idx === i ? next : v)));
  }

  // The one-click version of the paper's stated conflict: a wholesaler
  // facing a per-order cost typically prefers fewer, larger batches than
  // what the retailer asked for. optimalProcurement already searches every
  // batching of a need stream for the one that minimizes wholesalerOrderCost
  // + wholesalerHoldingCost — reusing it here on the retailer's actual ask
  // (not the wholesaler's own possibly-edited draft) answers "what's the
  // cheapest way for ME to cover exactly what they requested," which is the
  // hypothesis this button exists to make cheap to test. Both this and the
  // comparison line below are host-optional (config.allowConsolidationHint):
  // an instructor running the exercise as a lot-sizing discovery task can
  // turn off the shortcut and the spoiler together.
  const need = rfqQuantities ?? config.monthlyDemand;

  function tryConsolidating() {
    setQuantities(optimalProcurement(need, config).schedule);
  }

  // The wholesaler's equivalent of the retailer's "if you accept this
  // exactly as offered" line in ResponseForm — same best-case procurement
  // assumption as the rest of this panel, just run against their counter
  // instead of whatever's currently typed.
  const counterQuantities = lastRequestedQuantities ?? config.monthlyDemand;
  const acceptCounterEstimate =
    lastRequestedPrice != null
      ? wholesalerSettlement(
          lastRequestedPrice,
          counterQuantities,
          optimalProcurement(counterQuantities, config).schedule,
          config,
        )
      : null;

  // The wholesaler's equivalent of the retailer's "Accept this offer"
  // button: submits their exact last counter back as your proposal,
  // one click instead of retyping five fields to match it. This doesn't
  // skip a round or close the contract by itself — same as any other
  // submitProposal call, it still waits on the retailer's own accept next
  // round — it just removes the retyping between "I agree" and saying so.
  // Built from lastRequestedPrice/lastRequestedQuantities directly (not
  // from component state) so it can't race a same-tick setState against the
  // DOM values a native form submission would read.
  async function acceptCounter() {
    if (lastRequestedPrice == null) return;
    setPrice(lastRequestedPrice);
    setQuantities(counterQuantities);
    const formData = new FormData();
    formData.set("price", String(lastRequestedPrice));
    counterQuantities.forEach((q, i) => formData.set(`qty-${i}`, String(q)));
    await action(formData);
  }

  // A fixed pair of reference points (not tied to whatever's currently
  // typed above): matching the request exactly means one order per non-zero
  // month and — because supply equals need every month — zero carried
  // inventory, so that cost is pure wholesalerOrderCost x order count.
  // bestForRequest is optimalProcurement's real search over every batching
  // of the SAME request, independent of the draft in the fields; comparing
  // the two turns "best-case order + holding cost" from one abstract number
  // into a visible amount being left on the table.
  const exactMatchOrders = need.filter((q) => q > 0).length;
  const exactMatchCost = config.wholesalerOrderCost * exactMatchOrders;
  const bestForRequest = optimalProcurement(need, config);
  const consolidationSavings = exactMatchCost - bestForRequest.cost;

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
      {acceptCounterEstimate && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          If you accept this exactly as offered, your estimated profit: $
          {Math.round(acceptCounterEstimate.profit).toLocaleString()}
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
          onChange={(e) => setPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
          required
          placeholder="Enter your price"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      {config.allowConsolidationHint && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={tryConsolidating}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Try consolidating
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              Rebatches the schedule below to whatever minimizes your own order + holding costs for
              what they asked for — compare the profit change, then edit further if you want.
            </span>
          </div>

          <p className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            Matching their exact request as-is: ${exactMatchCost.toLocaleString()} in ordering/holding
            costs ({exactMatchOrders} shipment{exactMatchOrders === 1 ? "" : "s"}) — consolidating to{" "}
            {bestForRequest.orders} shipment{bestForRequest.orders === 1 ? "" : "s"} instead: $
            {Math.round(bestForRequest.cost).toLocaleString()}
            {consolidationSavings > 0 &&
              `. That's $${Math.round(consolidationSavings).toLocaleString()} sitting on the table if you don't.`}
          </p>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {config.horizonLabels.map((label, i) => (
          <label key={label} className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            {label}{" "}
            {rfqQuantities && (
              <span className="text-zinc-400 dark:text-zinc-500">(asked: {rfqQuantities[i] ?? 0})</span>
            )}
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

      <DemandWarning units={askShortfall}>
        This would leave your retailer {askShortfall} unit{askShortfall === 1 ? "" : "s"} short of what
        they asked for — they may not be able to meet their own demand with this schedule.
      </DemandWarning>

      {rfqQuantities && (
        <MonthlyBreakdownTable
          horizonLabels={config.horizonLabels}
          need={rfqQuantities}
          supply={numericQuantities}
          needLabel="They asked"
          supplyLabel="You'd deliver"
        />
      )}

      <div className="rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        {estimate ? (
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
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Enter a price above to see your estimated profit.
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Assumes you procure from your manufacturer in the cheapest way
          possible for this schedule — your actual procurement choice
          happens later, once a price is agreed, and could cost more if you
          don&apos;t optimize it.
        </p>
      </div>

      {config.allowNotes && <ProposalNoteField maxLength={config.noteMaxLength} />}
      <div className="flex flex-wrap gap-3">
        {lastRequestedPrice != null && (
          <button
            type="button"
            onClick={acceptCounter}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Accept their counter-offer
          </button>
        )}
        <button
          type="submit"
          className={
            lastRequestedPrice != null
              ? "rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
              : "rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          }
        >
          Send proposal
        </button>
      </div>
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
