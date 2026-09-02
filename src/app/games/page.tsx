import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { GameCategory } from "@prisma/client";
import {
  BabyFaceIcon,
  BeerMugIcon,
  DiceIcon,
  NewspaperIcon,
  TrendChartIcon,
} from "@/components/GameIcons";

const GAME_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "dice-simulator": DiceIcon,
  "random-babies": BabyFaceIcon,
  "beer-game": BeerMugIcon,
  newsvendor: NewspaperIcon,
  "newsvendor-solo": NewspaperIcon,
  forecasting: TrendChartIcon,
};

const SECTIONS: { category: GameCategory; title: string; blurb: string }[] = [
  {
    category: "SIMULATION",
    title: "Simulations",
    blurb: "Open-ended tools for exploring a concept — no scoring, no session.",
  },
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
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

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
        Simulations &amp; games
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {inSection.map((game) => {
                const Icon = GAME_ICONS[game.slug];
                return (
                  <Link
                    key={game.slug}
                    href={`/games/${game.slug}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {game.name}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {game.description}
                      </p>
                    </div>
                    {Icon && <Icon />}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
