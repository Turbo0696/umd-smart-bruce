export type ChatTurn = { role: "user" | "assistant"; content: string };

// Portkey-fronted gateway (University of Michigan's GPT toolkit) serving
// Claude via the standard Anthropic Messages API shape — just a
// different auth header than talking to Anthropic directly.
//
// The gateway occasionally hangs or drops a connection under load, which
// previously surfaced to the student as an opaque "Couldn't reach the
// tutor" with no chance to recover. fetchWithRetry (see ./fetchRetry)
// gives it one bounded retry with a per-attempt timeout before we give up.
import { fetchWithRetry } from "./fetchRetry";

// Runs after embeddings in the same request (see embeddings.ts) and does
// the actual generation, so it gets most of the function's remaining
// budget: up to 2 attempts x 18s = 36s worst case. Combined with
// embeddings' 16s worst case that's 52s, safely inside the 60s
// maxDuration set on the tutor route's actions.ts.
const CHAT_ATTEMPT_TIMEOUT_MS = 18_000;

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
