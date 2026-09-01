type IconProps = { className?: string };

const BADGE = "shrink-0 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60";

export function DiceIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <g transform="rotate(-8 14 26)">
          <rect x="4" y="16" width="20" height="20" rx="4" className="fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-600" strokeWidth={1.5} />
          <circle cx="10" cy="22" r="1.6" className="fill-zinc-400 dark:fill-zinc-500" />
          <circle cx="18" cy="22" r="1.6" className="fill-zinc-400 dark:fill-zinc-500" />
          <circle cx="10" cy="30" r="1.6" className="fill-zinc-400 dark:fill-zinc-500" />
          <circle cx="18" cy="30" r="1.6" className="fill-zinc-400 dark:fill-zinc-500" />
        </g>
        <g transform="rotate(10 26 18)">
          <rect x="16" y="4" width="20" height="20" rx="4" className="fill-blue-50 stroke-blue-400 dark:fill-blue-950 dark:stroke-blue-500" strokeWidth={1.5} />
          <circle cx="26" cy="14" r="1.8" className="fill-blue-600 dark:fill-blue-400" />
          <circle cx="21" cy="19" r="1.8" className="fill-blue-600 dark:fill-blue-400" />
          <circle cx="31" cy="9" r="1.8" className="fill-blue-600 dark:fill-blue-400" />
          <circle cx="21" cy="9" r="1.8" className="fill-blue-600 dark:fill-blue-400" />
          <circle cx="31" cy="19" r="1.8" className="fill-blue-600 dark:fill-blue-400" />
        </g>
      </svg>
    </div>
  );
}

export function BabyFaceIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <circle cx="20" cy="22" r="14" className="fill-emerald-50 stroke-emerald-400 dark:fill-emerald-950 dark:stroke-emerald-500" strokeWidth={1.5} />
        <path
          d="M 17 9 Q 22 1 25 8"
          fill="none"
          className="stroke-emerald-500 dark:stroke-emerald-400"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx="15" cy="21" r="1.8" className="fill-emerald-700 dark:fill-emerald-300" />
        <circle cx="25" cy="21" r="1.8" className="fill-emerald-700 dark:fill-emerald-300" />
        <path
          d="M 14 27 Q 20 33 26 27"
          fill="none"
          className="stroke-emerald-700 dark:stroke-emerald-300"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function BeerMugIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <path
          d="M 10 12 h 16 v 20 a 3 3 0 0 1 -3 3 h -10 a 3 3 0 0 1 -3 -3 Z"
          className="fill-amber-50 stroke-amber-500 dark:fill-amber-950 dark:stroke-amber-400"
          strokeWidth={1.5}
        />
        <path
          d="M 26 16 h 3 a 3 3 0 0 1 3 3 v 4 a 3 3 0 0 1 -3 3 h -3"
          fill="none"
          className="stroke-amber-500 dark:stroke-amber-400"
          strokeWidth={1.5}
        />
        <path
          d="M 10 15 Q 8 10 12 8 Q 12 12 15 9 Q 16 13 19 9 Q 20 13 23 9 Q 24 12 26 9 Q 27 12 26 15 Z"
          className="fill-amber-100 stroke-amber-400 dark:fill-amber-100/90 dark:stroke-amber-300"
          strokeWidth={1.2}
        />
        <line x1="10" y1="20" x2="26" y2="20" className="stroke-amber-300 dark:stroke-amber-600" strokeWidth={1} />
      </svg>
    </div>
  );
}

export function NewspaperIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <path
          d="M 7 9 h 22 a 2 2 0 0 1 2 2 v 18 a 2 2 0 0 1 -2 2 H 10 a 3 3 0 0 1 -3 -3 Z"
          className="fill-white stroke-zinc-400 dark:fill-zinc-900 dark:stroke-zinc-500"
          strokeWidth={1.5}
        />
        <path
          d="M 7 9 v 19 a 3 3 0 0 0 3 3"
          fill="none"
          className="stroke-zinc-400 dark:stroke-zinc-500"
          strokeWidth={1.5}
        />
        <line x1="11" y1="14" x2="27" y2="14" className="stroke-red-500 dark:stroke-red-400" strokeWidth={1.8} />
        <line x1="11" y1="19" x2="27" y2="19" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.2} />
        <line x1="11" y1="23" x2="27" y2="23" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.2} />
        <line x1="11" y1="27" x2="21" y2="27" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.2} />
      </svg>
    </div>
  );
}

export function TrendChartIcon({ className = "" }: IconProps) {
  return (
    <div className={`${BADGE} ${className}`}>
      <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-hidden="true">
        <polyline
          points="8,28 15,20 21,24 32,10"
          fill="none"
          className="stroke-blue-500 dark:stroke-blue-400"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline points="25,10 32,10 32,17" fill="none" className="stroke-blue-500 dark:stroke-blue-400" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="28" r="1.8" className="fill-blue-600 dark:fill-blue-300" />
        <circle cx="15" cy="20" r="1.8" className="fill-blue-600 dark:fill-blue-300" />
        <circle cx="21" cy="24" r="1.8" className="fill-blue-600 dark:fill-blue-300" />
        <line x1="6" y1="32" x2="34" y2="32" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1.2} />
      </svg>
    </div>
  );
}
