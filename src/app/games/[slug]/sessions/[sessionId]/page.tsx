import { notFound } from "next/navigation";
import { BeerGameSession } from "./BeerGameSession";
import { NewsvendorSession } from "./NewsvendorSession";

export default async function SessionPage(
  props: PageProps<"/games/[slug]/sessions/[sessionId]">,
) {
  const { slug, sessionId } = await props.params;

  if (slug === "beer-game") {
    return <BeerGameSession slug={slug} sessionId={sessionId} />;
  }
  if (slug === "newsvendor") {
    return <NewsvendorSession slug={slug} sessionId={sessionId} />;
  }

  notFound();
}
