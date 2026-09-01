import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BeerGameLanding } from "./BeerGameLanding";
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

  notFound();
}
