import { fetchWithRetry } from "./fetchRetry";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Same Portkey-fronted UMGPT gateway as src/lib/tutor.ts, just a
// different path — it proxies an OpenAI-compatible embeddings endpoint
// under the same key, so no separate embeddings provider is needed.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetchWithRetry(process.env.TUTOR_EMBEDDINGS_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portkey-api-key": process.env.TUTOR_API_KEY!,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

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
