import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function GamesPage() {
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
        Simulation games
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/games/${game.slug}`}
            className="rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400"
          >
            <h2 className="font-semibold text-zinc-900">{game.name}</h2>
            <p className="mt-1 text-sm text-zinc-600">{game.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
