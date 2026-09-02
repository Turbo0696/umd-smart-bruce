type IconProps = { className?: string };

const BADGE = "shrink-0 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60";

// A small decision tree: one choice splits into two outcomes, one taken
// (filled) and one not (outline) — the core idea of decision sciences.
export function DecisionTreeIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <line x1="20" y1="9" x2="11" y2="22" className="stroke-violet-400 dark:stroke-violet-500" strokeWidth={1.8} />
        <line x1="20" y1="9" x2="29" y2="22" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.8} />
        <line x1="11" y1="22" x2="7" y2="33" className="stroke-violet-400 dark:stroke-violet-500" strokeWidth={1.8} />
        <line x1="11" y1="22" x2="15" y2="33" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.8} />
        <circle cx="20" cy="9" r="4" className="fill-violet-100 stroke-violet-500 dark:fill-violet-950 dark:stroke-violet-400" strokeWidth={1.5} />
        <circle cx="11" cy="22" r="3.5" className="fill-violet-500 stroke-violet-500 dark:fill-violet-400 dark:stroke-violet-400" strokeWidth={1.5} />
        <circle cx="29" cy="22" r="3.5" className="fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-600" strokeWidth={1.5} />
        <circle cx="7" cy="33" r="3" className="fill-violet-500 stroke-violet-500 dark:fill-violet-400 dark:stroke-violet-400" strokeWidth={1.5} />
        <circle cx="15" cy="33" r="3" className="fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-600" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// Three linked nodes with directional arrows — supplier through hub to
// customer, the shape of a supply chain.
export function SupplyChainIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <line x1="9" y1="20" x2="31" y2="20" className="stroke-cyan-400 dark:stroke-cyan-500" strokeWidth={1.8} />
        <circle cx="6" cy="20" r="4.5" className="fill-cyan-50 stroke-cyan-500 dark:fill-cyan-950 dark:stroke-cyan-400" strokeWidth={1.5} />
        <circle cx="20" cy="20" r="5.5" className="fill-cyan-500 stroke-cyan-500 dark:fill-cyan-400 dark:stroke-cyan-400" strokeWidth={1.5} />
        <circle cx="34" cy="20" r="4.5" className="fill-cyan-50 stroke-cyan-500 dark:fill-cyan-950 dark:stroke-cyan-400" strokeWidth={1.5} />
        <path d="M 11.5 17.5 L 15 20 L 11.5 22.5" fill="none" className="stroke-cyan-600 dark:stroke-cyan-200" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 25 17.5 L 28.5 20 L 25 22.5" fill="none" className="stroke-cyan-600 dark:stroke-cyan-200" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
