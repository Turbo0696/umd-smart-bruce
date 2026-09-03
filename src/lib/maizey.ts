import { prisma } from "@/lib/prisma";
import { fetchWithRetry } from "./fetchRetry";

// Maizey (U-M ITS's own RAG chatbot tool) exposes exactly two REST
// calls, both scoped under a "Project" (its knowledge base lives there,
// uploaded through Maizey's own UI — nothing we manage). There is no
// endpoint to list, resume, or delete a conversation, which is why
// MaizeyConversation exists in the schema: we remember the conversation
// pk ourselves, one per (tutor, student) pair.
const MAIZEY_BASE_URL = "https://umgpt.umich.edu/maizey/api";

// Mirrors tutor.ts's CHAT_ATTEMPT_TIMEOUT_MS reasoning: this is a real
// generation call through another RAG stack, not a quick lookup, so it
// gets most of the route's 60s maxDuration budget rather than a short
// one with a retry.
const MESSAGE_ATTEMPT_TIMEOUT_MS = 48_000;
const CONVERSATION_ATTEMPT_TIMEOUT_MS = 15_000;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MAIZEY_API_TOKEN}`,
  };
}

async function createMaizeyConversation(projectPk: string): Promise<string> {
  const res = await fetchWithRetry(
    `${MAIZEY_BASE_URL}/projects/${projectPk}/conversation/`,
    { method: "POST", headers: authHeaders(), body: JSON.stringify({}) },
    { attempts: 2, timeoutMs: CONVERSATION_ATTEMPT_TIMEOUT_MS },
  );

  if (!res.ok) {
    throw new Error(`Maizey conversation error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  if (data?.pk === undefined || data?.pk === null) {
    throw new Error(
      `Unexpected Maizey conversation response shape: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return String(data.pk);
}

// One conversation per (tutor, student): reuses the stored pk on every
// message after the first so a student's follow-up question stays in
// the same Maizey conversation instead of starting fresh each time.
export async function getOrCreateMaizeyConversation(
  tutorTopicId: string,
  userId: string,
  projectPk: string,
): Promise<string> {
  const existing = await prisma.maizeyConversation.findUnique({
    where: { tutorTopicId_userId: { tutorTopicId, userId } },
  });
  if (existing) return existing.conversationPk;

  const conversationPk = await createMaizeyConversation(projectPk);

  // Two requests racing here (double-submit) would violate the
  // @@unique([tutorTopicId, userId]) constraint on the second insert —
  // treat that as "someone else already created it" and reuse theirs
  // rather than surfacing an error to the second request.
  try {
    await prisma.maizeyConversation.create({
      data: { tutorTopicId, userId, conversationPk },
    });
  } catch {
    const raceWinner = await prisma.maizeyConversation.findUnique({
      where: { tutorTopicId_userId: { tutorTopicId, userId } },
    });
    if (raceWinner) return raceWinner.conversationPk;
    throw new Error("Could not start a Maizey conversation.");
  }

  return conversationPk;
}

export async function sendMaizeyMessage(
  projectPk: string,
  conversationPk: string,
  query: string,
): Promise<string> {
  const res = await fetchWithRetry(
    `${MAIZEY_BASE_URL}/projects/${projectPk}/conversation/${conversationPk}/messages/`,
    { method: "POST", headers: authHeaders(), body: JSON.stringify({ query }) },
    { attempts: 2, timeoutMs: MESSAGE_ATTEMPT_TIMEOUT_MS },
  );

  if (!res.ok) {
    throw new Error(`Maizey message error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  if (typeof data?.response !== "string") {
    console.error("[sendMaizeyMessage] unexpected response shape:", JSON.stringify(data).slice(0, 2000));
    throw new Error(
      `Unexpected Maizey message response shape: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return data.response;
}
