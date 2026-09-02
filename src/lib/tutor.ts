export type ChatTurn = { role: "user" | "assistant"; content: string };

// Portkey-fronted gateway (University of Michigan's GPT toolkit) serving
// Claude via the standard Anthropic Messages API shape — just a
// different auth header than talking to Anthropic directly.
//
// Confirmed via the gateway's own usage dashboard: requests that ended in
// "Couldn't reach the tutor" still showed token consumption there — the
// model really was generating a full answer, our client just gave up on
// it first. So this needs a generous timeout, not a short one with a
// retry (see ./fetchRetry for why a timed-out attempt isn't retried).
import { fetchWithRetry } from "./fetchRetry";

// Runs after embeddings in the same request (see embeddings.ts) and does
// the actual generation — the slow part, especially with a full RAG
// context in the prompt. Gets nearly all of the function's budget: one
// real attempt up to 48s (a retry only fires for a fast-failing 5xx/429,
// not for this timeout — see fetchRetry). Combined with embeddings'
// ~8s that's comfortably inside the 60s maxDuration set on the tutor
// route's actions.ts.
const CHAT_ATTEMPT_TIMEOUT_MS = 48_000;

export async function askTutor(
  systemPrompt: string,
  messages: ChatTurn[],
): Promise<string> {
  const res = await fetchWithRetry(
    process.env.TUTOR_API_BASE_URL!,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-portkey-api-key": process.env.TUTOR_API_KEY!,
      },
      body: JSON.stringify({
        model: process.env.TUTOR_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    },
    { attempts: 2, timeoutMs: CHAT_ATTEMPT_TIMEOUT_MS },
  );

  if (!res.ok) {
    throw new Error(`Tutor API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Unexpected tutor API response shape.");
  }
  return text;
}
