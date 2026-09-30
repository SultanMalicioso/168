/* ------------------------------------------------------------------ *
 * notify-scheduler
 * Called by pg_cron (job "notify-scheduler-every-5-minutes"). It only
 * wakes the app's dispatcher, `/api/public/push-tick`, which plans the
 * due reminders and sends them with the app's VAPID keys — so the keys
 * the browser subscribed with and the keys that sign every push always
 * live in one place (the app's env vars).
 *
 * Secrets required in Supabase (Edge Functions → Secrets):
 *   APP_URL           e.g. https://your-app.vercel.app
 *   PUSH_CRON_SECRET  same value as PUSH_CRON_SECRET in the app
 * ------------------------------------------------------------------ */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async () => {
  const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
  const secret = (Deno.env.get("PUSH_CRON_SECRET") ?? "").trim();

  if (!appUrl || !secret) {
    const missing = [!appUrl && "APP_URL", !secret && "PUSH_CRON_SECRET"].filter(Boolean);
    console.error(`[notify-scheduler] missing secrets: ${missing.join(", ")}`);
    return json({ ok: false, error: `missing secrets: ${missing.join(", ")}` }, 500);
  }

  try {
    const res = await fetch(`${appUrl}/api/public/push-tick`, {
      method: "POST",
      headers: { "x-push-secret": secret },
      signal: AbortSignal.timeout(55_000),
    });
    const text = await res.text();

    if (!res.ok) {
      console.error(`[notify-scheduler] push-tick ${res.status}: ${text}`);
    }

    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    console.error("[notify-scheduler] push-tick unreachable", error);
    return json({ ok: false, error: String(error) }, 502);
  }
});
