import { prisma } from "@/lib/prisma";
import { DEFAULT_CONFIG, type FishBanksConfig } from "@/lib/fishBanks";

const COMPANY_NAME_POOL = [
  "Blue Horizon Fishing",
  "Pelican Bay Trawlers",
  "Northern Fleet Co.",
  "Tidewater Marine",
  "Cape Anchor Seafood",
  "Saltwind Fisheries",
  "Harbor Light Trawling",
  "Deep Current Co.",
];

export function configFromSession(session: { config: unknown }): FishBanksConfig {
  return { ...DEFAULT_CONFIG, ...(session.config as Partial<FishBanksConfig> | null) };
}

// Mirrors src/lib/games.ts's addParticipant / newsvendorGames.ts's
// addNewsvendorParticipant, but Fish Banks participants are companies —
// each gets a starting cash balance and fleet size pulled from the
// session's config, plus an auto-assigned company name.
export async function addFishBanksParticipant(sessionId: string, userId: string) {
  const session = await prisma.fishBanksSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Fleet not found.");
  if (session.status !== "PENDING") {
    throw new Error("This fleet has already set sail.");
  }
  if (session.participants.some((p) => p.userId === userId)) {
    return; // already joined, nothing to do
  }

  const config = configFromSession(session);
  const takenNames = new Set(session.participants.map((p) => p.companyName));
  const companyName =
    COMPANY_NAME_POOL.find((n) => !takenNames.has(n)) ??
    `Company ${session.participants.length + 1}`;

  await prisma.fishBanksParticipant.create({
    data: {
      sessionId,
      userId,
      companyName,
      cash: config.startingCash,
      ships: config.startingShips,
    },
  });
}
