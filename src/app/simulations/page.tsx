import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { ActivityGrid } from "@/components/ActivityGrid";
import { GAME_ICONS } from "@/components/GameIcons";

// Simulations are SIMULATION-category Game rows; their pages still live
// under /games/[slug] so existing links keep working.
export default async function SimulationsPage() {
  const simulations = await prisma.game.findMany({
    where: { category: "SIMULATION" },
    orderBy: { name: "asc" },
  });
  // Alphabetical, except Optimal Stopping always sorts last — it's the
  // newest simulation and reads best as the final card rather than
  // wherever its name falls alphabetically.
  simulations.sort((a, b) => {
    if (a.slug === "optimal-stopping") return 1;
    if (b.slug === "optimal-stopping") return -1;
    return 0;
  });

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
        Simulations
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Open-ended tools for exploring a concept — no scoring, no session.
      </p>
      <ActivityGrid
        items={simulations.map((g) => ({
          href: `/games/${g.slug}`,
          name: g.name,
          description: g.description,
          Icon: GAME_ICONS[g.slug],
        }))}
      />
    </div>
  );
}
