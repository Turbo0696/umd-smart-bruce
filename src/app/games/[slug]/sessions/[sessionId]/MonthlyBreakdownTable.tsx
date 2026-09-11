import { settleMonths } from "@/lib/negotiation";

// Month-by-month decision aid for whoever is looking at a supply schedule
// against a need schedule — same settleMonths the engine settles with, just
// walked out row by row instead of collapsed into one "N units unmet"
// total, so a mismatch that's hidden by matching grand totals (surplus in
// one month, shortfall in another) is visible at the month it actually
// happens. No hooks, no client-only APIs — safe to import from both a
// server-rendered form (ResponseForm) and a "use client" estimator alike.
export function MonthlyBreakdownTable({
  horizonLabels,
  need,
  supply,
  needLabel = "Demand",
  supplyLabel = "Delivery",
}: {
  horizonLabels: readonly string[];
  need: readonly number[];
  supply: readonly number[];
  needLabel?: string;
  supplyLabel?: string;
}) {
  const { sold, unmet, ending } = settleMonths(supply, need);
  const available = horizonLabels.map((_, i) => (i === 0 ? 0 : ending[i - 1] ?? 0) + (supply[i] ?? 0));

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
            <th className="py-1.5 pr-2 font-medium">Month</th>
            <th className="py-1.5 pr-2 text-right font-medium">{needLabel}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{supplyLabel}</th>
            <th className="py-1.5 pr-2 text-right font-medium">Available</th>
            <th className="py-1.5 pr-2 text-right font-medium">Sold</th>
            <th className="py-1.5 pr-2 text-right font-medium">Unmet</th>
            <th className="py-1.5 text-right font-medium">Ending inv.</th>
          </tr>
        </thead>
        <tbody>
          {horizonLabels.map((label, i) => (
            <tr key={label} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 pr-2 text-zinc-700 dark:text-zinc-300">{label}</td>
              <td className="py-1.5 pr-2 text-right text-zinc-700 dark:text-zinc-300">{need[i] ?? 0}</td>
              <td className="py-1.5 pr-2 text-right text-zinc-700 dark:text-zinc-300">{supply[i] ?? 0}</td>
              <td className="py-1.5 pr-2 text-right text-zinc-500 dark:text-zinc-500">{available[i]}</td>
              <td className="py-1.5 pr-2 text-right text-zinc-700 dark:text-zinc-300">{sold[i] ?? 0}</td>
              <td
                className={`py-1.5 pr-2 text-right ${
                  (unmet[i] ?? 0) > 0
                    ? "font-semibold text-amber-600 dark:text-amber-400"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {(unmet[i] ?? 0) > 0 ? unmet[i] : "—"}
              </td>
              <td className="py-1.5 text-right text-zinc-500 dark:text-zinc-500">{ending[i] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
