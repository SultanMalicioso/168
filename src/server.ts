import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/*
 * Security headers on every response. On the Vercel deployment the full
 * Content-Security-Policy is enforced: scripts, connections and frames are
 * limited to this site, Supabase and the Lovable sign-in. Inline scripts stay
 * allowed because the router streams its state in them. Elsewhere (the
 * Lovable editor preview injects its own scripts) it only reports.
 */
const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app";

const FULL_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  "frame-src 'self' https://*.lovable.dev https://*.lovable.app",
  "worker-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  FRAME_ANCESTORS,
  "upgrade-insecure-requests",
].join("; ");

const ENFORCE_CSP = process.env["VERCEL"] === "1";

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  ...(ENFORCE_CSP
    ? { "Content-Security-Policy": FULL_CSP, "X-Frame-Options": "SAMEORIGIN" }
    : {
        "Content-Security-Policy": `${FRAME_ANCESTORS}; object-src 'none'; base-uri 'self'`,
        "Content-Security-Policy-Report-Only": FULL_CSP,
      }),
};

function withSecurityHeaders(response: Response): Response {
  // Some responses (e.g. redirects from fetch) have immutable headers.
  let out = response;
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  } catch {
    out = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  }
  return out;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
