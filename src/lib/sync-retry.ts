/**
 * Wait before retrying a failed cloud upload: 2 s, 5 s, 15 s, then every
 * 60 s. `attempt` counts the failures in a row (0 = first retry).
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000];

export function retryDelay(attempt: number): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const i = Math.min(n, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[i];
}
