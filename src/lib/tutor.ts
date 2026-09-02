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

export async function askTutor(
  systemPrompt: string,
  messages: ChatTurn[],
): Promise<string> {
  const res = await fetchWithRetry(process.env.TUTOR_API_BASE_URL!, {
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
  });

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
