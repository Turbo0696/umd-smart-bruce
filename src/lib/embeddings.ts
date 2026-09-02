import { fetchWithRetry } from "./fetchRetry";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Same Portkey-fronted UMGPT gateway as src/lib/tutor.ts, just a
// different path — it proxies an OpenAI-compatible embeddings endpoint
// under the same key, so no separate embeddings provider is needed.
// Runs before the (slower) chat completion in the same request, so it
// gets a short budget: up to 2 attempts x 8s = 16s worst case.
const EMBEDDINGS_ATTEMPT_TIMEOUT_MS = 8_000;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetchWithRetry(
    process.env.TUTOR_EMBEDDINGS_URL!,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-portkey-api-key": process.env.TUTOR_API_KEY!,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    },
    { attempts: 2, timeoutMs: EMBEDDINGS_ATTEMPT_TIMEOUT_MS },
  );

  if (!res.ok) {
    throw new Error(`Embeddings API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
