import { prisma } from "@/lib/prisma";

// Mirrors src/lib/games.ts's addParticipant, but Newsvendor has no fixed
// role/slot count — any number of players can join while PENDING.
export async function addNewsvendorParticipant(sessionId: string, userId: string) {
  const session = await prisma.newsvendorSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Competition not found.");
  if (session.status !== "PENDING") {
    throw new Error("This competition has already started.");
  }
  if (session.participants.some((p) => p.userId === userId)) {
    return; // already joined, nothing to do
  }

  await prisma.newsvendorParticipant.create({
    data: { sessionId, userId },
  });
}
