// Shared retry wrapper for the two calls that hit the UMGPT/Portkey
// gateway (chat completions in ./tutor.ts, embeddings in ./embeddings.ts).
// That gateway is an external, occasionally-slow service — a bare `fetch`
// with no timeout can hang until the whole Vercel function is killed, and
// a single dropped connection or 5xx used to end the student's turn with
// no way to recover short of retyping their question.
//
// This gives each call a bounded number of retries with a per-attempt
// timeout, but only for failures that are actually worth retrying:
// network errors, timeouts, and 5xx/429 — not 4xx like a bad request or
// an auth failure, which will just fail the same way again.
//
// sendMessage (see the tutor route's actions.ts) calls embeddings and
// then chat completions *sequentially* inside one 60s server action, so
// the two call sites pass their own (attempts, timeoutMs) sized to leave
// room for each other — see the comments in tutor.ts / embeddings.ts.
const DEFAULT_ATTEMPT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
