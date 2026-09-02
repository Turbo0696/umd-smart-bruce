import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { listCoursesForInstructor } from "@/lib/courses";
import type { ForecastMethod } from "@/lib/forecasting";
import { METHOD_ORDER } from "@/lib/forecasting";
import { prisma } from "@/lib/prisma";
import { NEWSVENDOR_SCENARIOS } from "@/lib/newsvendorScenarios";
import { BeerGameLanding } from "./BeerGameLanding";
import { DiceSimulator } from "./DiceSimulator";
import { FishBanksLanding } from "./FishBanksLanding";
import { FishBanksSoloGame } from "./FishBanksSoloGame";
import { ForecastingGame } from "./ForecastingGame";
import { NewsvendorLanding } from "./NewsvendorLanding";
import { NewsvendorSoloGame } from "./NewsvendorSoloGame";
import { RandomBabiesSimulator } from "./RandomBabiesSimulator";

export default async function GamePage(props: PageProps<"/games/[slug]">) {
  const { slug } = await props.params;
  const [game, profile] = await Promise.all([
    prisma.game.findUnique({ where: { slug } }),
    getCurrentProfile(),
  ]);

  if (!game) {
    notFound();
  }

  if (slug === "beer-game" || slug === "newsvendor" || slug === "fish-banks") {
    const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
    const instructorCourses = canCreate
      ? await listCoursesForInstructor(profile!.id)
      : [];

    if (slug === "beer-game") {
      return (
        <BeerGameLanding game={game} profile={profile} instructorCourses={instructorCourses} />
      );
    }
    if (slug === "fish-banks") {
      return (
        <FishBanksLanding game={game} profile={profile} instructorCourses={instructorCourses} />
      );
    }
    return (
      <NewsvendorLanding game={game} profile={profile} instructorCourses={instructorCourses} />
    );
  }
  if (slug === "fish-banks-solo") {
    return <FishBanksSoloGame />;
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
  if (slug === "newsvendor-solo") {
    const canSeeClass = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";

    const [ownAttempts, allAttempts] = await Promise.all([
      profile
        ? prisma.soloNewsvendorAttempt.findMany({ where: { userId: profile.id } })
        : Promise.resolve([]),
      canSeeClass
        ? prisma.soloNewsvendorAttempt.findMany({ include: { user: true } })
        : Promise.resolve(null),
    ]);

    const stats = profile
      ? {
          rounds: ownAttempts.length,
          avgProfit: average(ownAttempts.map((a) => a.profit)),
          byScenario: NEWSVENDOR_SCENARIOS.map((scenario) => {
            const rows = ownAttempts.filter((a) => a.scenarioSlug === scenario.slug);
            return {
              scenarioSlug: scenario.slug,
              rounds: rows.length,
              avgProfit: average(rows.map((a) => a.profit)),
            };
          }).filter((s) => s.rounds > 0),
        }
      : null;

    const classStats = allAttempts
      ? Object.values(
          allAttempts.reduce<
            Record<string, { userId: string; name: string; profits: number[] }>
          >((acc, a) => {
            acc[a.userId] ??= {
              userId: a.userId,
              name: a.user.name ?? a.user.email,
              profits: [],
            };
            acc[a.userId].profits.push(a.profit);
            return acc;
          }, {}),
        ).map((row) => ({
          userId: row.userId,
          name: row.name,
          rounds: row.profits.length,
          avgProfit: average(row.profits),
        }))
      : null;

    return (
      <NewsvendorSoloGame isLoggedIn={!!profile} stats={stats} classStats={classStats} />
    );
  }
  if (slug === "dice-simulator") {
    return <DiceSimulator />;
  }
  if (slug === "random-babies") {
    return <RandomBabiesSimulator />;
  }

  notFound();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
