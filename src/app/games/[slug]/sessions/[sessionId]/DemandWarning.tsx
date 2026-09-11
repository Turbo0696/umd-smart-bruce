// A shared, deliberately loud treatment for "this schedule leaves demand on
// the table" — used by RfqEstimator, ProposalEstimator, and ReviseEstimator.
// Kept as its own tiny component (rather than three copies, unlike each
// file's own EstimateStat) because the point is that it should look
// different from the neutral stat grids around it: loss-framing needs a
// bordered, colored, bold callout to actually get noticed, not one more
// number sitting next to other numbers.
export function DemandWarning({ units, children }: { units: number; children: React.ReactNode }) {
  if (units <= 0) return null;
  return (
    <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      ⚠ {children}
    </p>
  );
}
