/*
 * Browser push services. The server only ever sends to these hosts, so a
 * stored subscription can never make it call an arbitrary URL (SSRF).
 * Mirrors the push_subscriptions_endpoint_allowed check in the database.
 */
const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
const HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (EXACT_HOSTS.has(host)) return true;
  return HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && /^[a-z0-9-]+$/.test(host.slice(0, -suffix.length)),
  );
}
