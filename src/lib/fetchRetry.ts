// Shared retry wrapper for the two calls that hit the UMGPT/Portkey
// gateway (chat completions in ./tutor.ts, embeddings in ./embeddings.ts).
// That gateway is an external, occasionally-slow service — a bare `fetch`
// with no timeout can hang until the whole Vercel function is killed, and
// a single dropped connection or 5xx used to end the student's turn with
// no way to recover short of retyping their question.
//
// This gives each call one retry (two attempts total) with a per-attempt
// timeout, but only for failures that are actually worth retrying:
// network errors, timeouts, and 5xx/429 — not 4xx like a bad request or
// an auth failure, which will just fail the same way again.
const ATTEMPT_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok && isRetryableStatus(res.status) && attempt < attempts) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed after retry.");
}
