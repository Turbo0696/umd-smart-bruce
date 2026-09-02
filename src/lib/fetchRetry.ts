// Shared retry wrapper for the two calls that hit the UMGPT/Portkey
// gateway (chat completions in ./tutor.ts, embeddings in ./embeddings.ts).
//
// Confirmed against the gateway's own usage dashboard: a "Couldn't reach
// the tutor" failure was showing token consumption on the gateway side —
// meaning the model was actually generating a full answer, our client
// just gave up on it first. So a timeout here is NOT the same kind of
// failure as a dropped connection or a 5xx: retrying it with the same
// short deadline would only abort a second (still-billed) generation for
// no benefit. Only network-level errors and 5xx/429 are retried; an
// abort/timeout fails immediately after its one attempt, and a plain
// 4xx (bad request, bad key) isn't retried either since it'll just fail
// the same way again.
const DEFAULT_ATTEMPT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
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
      if (attempt < attempts && !isTimeout(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      // A timeout means the upstream call was still in flight (and, per
      // the gateway dashboard, still being billed) — stop here rather
      // than starting a second one on top of it.
      break;
    }
  }

  if (isTimeout(lastError)) {
    throw new Error(
      "The tutor is taking longer than expected to respond. It may still finish server-side, but this request timed out — please try again.",
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed after retry.");
}
