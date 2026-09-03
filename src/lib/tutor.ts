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

  // The first message in a conversation worked; a later one (longer
  // context) threw "Unexpected tutor API response shape" from a bare
  // `data.content?.[0]?.text` — meaning content[0] wasn't the text
  // block. The Anthropic Messages shape allows more than one content
  // block (e.g. a "thinking" block ahead of "text" for extended
  // thinking), so pick the first block that actually has type "text"
  // instead of assuming index 0, rather than requiring Portkey/UMGPT to
  // never add a leading block.
  const blocks = Array.isArray(data.content) ? data.content : [];
  const textBlock = blocks.find(
    (b: unknown): b is { type: "text"; text: string } =>
      typeof b === "object" &&
      b !== null &&
      (b as { type?: unknown }).type === "text" &&
      typeof (b as { text?: unknown }).text === "string",
  );

  if (!textBlock) {
    // Log the raw shape server-side (truncated) so if this guess is
    // wrong, the actual structure is right there in Vercel's logs
    // instead of requiring another round of blind guessing.
    console.error(
      "[askTutor] unexpected response shape:",
      JSON.stringify(data).slice(0, 2000),
    );
    throw new Error(
      `Unexpected tutor API response shape: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return textBlock.text;
}
