import { timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ *
 * Fixed-window rate limiter + small request-hardening helpers.
 * State lives in the server instance's memory: on serverless it is per
 * warm instance, so it is a best-effort brake against bursts, not a
 * global quota (Supabase Auth keeps its own limits for sign-in).
 * ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export class RateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`Demasiados intentos. Probá de nuevo en ${Math.ceil(retryAfterSec / 60)} min.`);
  }
}

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  // Still full (an attack with many keys): drop the oldest entries.
  for (const k of buckets.keys()) {
    if (buckets.size < MAX_BUCKETS) break;
    buckets.delete(k);
  }
}

/** Counts one hit for `key`; returns seconds to wait when over `max`, else 0. */
export function hit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return b.count > max ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

/** Seconds `key` must still wait without counting a new hit (0 = allowed). */
export function blockedFor(key: string, max: number): number {
  const b = buckets.get(key);
  const now = Date.now();
  return b && b.resetAt > now && b.count >= max ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

/** Throws RateLimitError when `key` exceeded `max` hits in `windowMs`. */
export function enforce(key: string, max: number, windowMs: number) {
  const wait = hit(key, max, windowMs);
  if (wait > 0) throw new RateLimitError(wait);
}

export function clientIp(request: Request | undefined | null): string {
  const h = request?.headers;
  return (
    h?.get("x-real-ip") ??
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h?.get("cf-connecting-ip") ??
    "unknown"
  ).slice(0, 64);
}

export function tooManyRequests(retryAfterSec: number) {
  return new Response(JSON.stringify({ error: "rate-limited" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const WINDOW_15_MIN = 15 * 60_000;
