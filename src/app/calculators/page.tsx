import Image from "next/image";
import { ActivityGrid, type ActivityCard } from "@/components/ActivityGrid";
import { BellCurveIcon } from "@/components/GameIcons";

// Calculators are stateless client-side tools, so unlike games and
// simulations they're listed here in code rather than seeded as Game rows.
const CALCULATORS: ActivityCard[] = [
  {
    href: "/calculators/p-value",
    name: "z & t p-Value Calculator",
    description:
      "Enter a z-value, or a t-statistic and degrees of freedom, to get an exact left-, right-, or two-tailed p-value, with the tail area shaded on the distribution.",
    Icon: BellCurveIcon,
  },
];

export default function CalculatorsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Image
        src="/images/bruce-patch-transparent.png"
        alt="Dearborn Goose Patrol patch, since 1959"
        width={700}
        height={321}
        className="mb-6 h-auto w-full max-w-xs rounded-lg"
        priority
      />
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Calculators
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Quick statistical lookups — type in your numbers and get an exact answer.
      </p>
      <ActivityGrid items={CALCULATORS} />
    </div>
  );
}
