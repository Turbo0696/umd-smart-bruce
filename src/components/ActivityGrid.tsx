import type { ComponentType } from "react";
import Link from "next/link";

export type ActivityCard = {
  href: string;
  name: string;
  description: string | null;
  Icon?: ComponentType<{ className?: string }>;
};

// The card grid shared by the Calculators, Simulations, and Games pages.
export function ActivityGrid({ items }: { items: ActivityCard[] }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {items.map(({ href, name, description, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
              {name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </div>
          {Icon && <Icon />}
        </Link>
      ))}
    </div>
  );
}
