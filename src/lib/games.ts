import { ROLE_ORDER } from "@/lib/beerGame";
import { prisma } from "@/lib/prisma";

// Shared by both the "enter a join code" flow (games/[slug]/actions.ts)
// and the "Join this session" button on a session's waiting-room view
// (games/[slug]/sessions/[sessionId]/actions.ts) — both need to actually
// enroll the user, not just navigate them to the session page.
export async function addParticipant(sessionId: string, userId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) throw new Error("Team not found.");
  if (session.status !== "PENDING") {
    throw new Error("This team has already started.");
  }
  if (session.participants.some((p) => p.userId === userId)) {
    return; // already joined, nothing to do
  }

  const takenRoles = new Set(session.participants.map((p) => p.role));
  const nextRole = ROLE_ORDER.find((role) => !takenRoles.has(role));
  if (!nextRole) throw new Error("This team is full.");

  await prisma.gameParticipant.create({
    data: { sessionId, userId, role: nextRole },
  });
}
