import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import type { ForecastMethod } from "@/lib/forecasting";
import { METHOD_ORDER } from "@/lib/forecasting";
import { prisma } from "@/lib/prisma";
import { BeerGameLanding } from "./BeerGameLanding";
import { ForecastingGame } from "./ForecastingGame";
import { NewsvendorLanding } from "./NewsvendorLanding";

export default async function GamePage(props: PageProps<"/games/[slug]">) {
  const { slug } = await props.params;
  const [game, profile] = await Promise.all([
    prisma.game.findUnique({ where: { slug } }),
    getCurrentProfile(),
  ]);

  if (!game) {
    notFound();
  }

  if (slug === "beer-game") {
    return <BeerGameLanding game={game} profile={profile} />;
  }
  if (slug === "newsvendor") {
    return <NewsvendorLanding game={game} profile={profile} />;
  }
  if (slug === "forecasting") {
    const canSeeClass = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";

    const [ownAttempts, allAttempts] = await Promise.all([
      profile
        ? prisma.forecastingAttempt.findMany({ where: { userId: profile.id } })
        : Promise.resolve([]),
      canSeeClass
        ? prisma.forecastingAttempt.findMany({ include: { user: true } })
        : Promise.resolve(null),
    ]);

    const stats = profile
      ? {
          rounds: ownAttempts.length,
          avgScore: average(ownAttempts.map((a) => a.score)),
          byMethod: METHOD_ORDER.map((method) => {
            const rows = ownAttempts.filter((a) => a.method === method);
            return {
              method: method as ForecastMethod,
              rounds: rows.length,
              avgScore: average(rows.map((a) => a.score)),
            };
          }).filter((m) => m.rounds > 0),
        }
      : null;

    const classStats = allAttempts
      ? Object.values(
          allAttempts.reduce<
            Record<string, { userId: string; name: string; scores: number[] }>
          >((acc, a) => {
            acc[a.userId] ??= {
              userId: a.userId,
              name: a.user.name ?? a.user.email,
              scores: [],
            };
            acc[a.userId].scores.push(a.score);
            return acc;
          }, {}),
        ).map((row) => ({
          userId: row.userId,
          name: row.name,
          rounds: row.scores.length,
          avgScore: average(row.scores),
        }))
      : null;

    return (
      <ForecastingGame isLoggedIn={!!profile} stats={stats} classStats={classStats} />
    );
  }

  notFound();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
