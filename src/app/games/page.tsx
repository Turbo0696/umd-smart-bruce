import Image from "next/image";
import { prisma } from "@/lib/prisma";
import type { GameCategory } from "@prisma/client";
import { ActivityGrid } from "@/components/ActivityGrid";
import { GAME_ICONS } from "@/components/GameIcons";

// SIMULATION-category rows live on /simulations instead.
const SECTIONS: { category: GameCategory; title: string; blurb: string }[] = [
  {
    category: "SINGLE_PLAYER",
    title: "Single-person games",
    blurb: "Practice on your own, at your own pace. Your rounds are tracked.",
  },
  {
    category: "MULTI_PLAYER",
    title: "Multi-person games",
    blurb: "Join with a class join code and play alongside classmates.",
  },
];

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    where: { category: { in: SECTIONS.map((s) => s.category) } },
    orderBy: { name: "asc" },
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
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Games
      </h1>

      {SECTIONS.map(({ category, title, blurb }) => {
        const inSection = games.filter((g) => g.category === category);
        if (inSection.length === 0) return null;
        return (
          <section key={category} className="mb-10">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {blurb}
            </p>
            <ActivityGrid
              items={inSection.map((g) => ({
                href: `/games/${g.slug}`,
                name: g.name,
                description: g.description,
                Icon: GAME_ICONS[g.slug],
              }))}
            />
          </section>
        );
      })}
    </div>
  );
}
