/* ------------------------------------------------------------------ *
 * notify-scheduler
 * Called every minute by pg_cron (job "notify-scheduler-every-5-minutes").
 * It wakes the app's dispatcher, `/api/public/push-tick`, which plans the
 * due reminders and sends them with the app's VAPID keys.
 *
 * The function is public, so it is throttled in the database: the
 * dispatcher runs at most once every 50 s no matter who calls, and
 * callers get no information back.
 *
 * Secrets required in Supabase (Edge Functions → Secrets):
 *   APP_URL           e.g. https://your-app.vercel.app
 *   PUSH_CRON_SECRET  same value as PUSH_CRON_SECRET in the app
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 * ------------------------------------------------------------------ */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const reply = (status: number) => new Response(null, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405);

  const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
  const secret = (Deno.env.get("PUSH_CRON_SECRET") ?? "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!appUrl || !secret) {
    console.error("[notify-scheduler] missing APP_URL or PUSH_CRON_SECRET");
    return reply(500);
  }

  /* One run per 50 s, whoever calls. If the check itself fails, run anyway:
     a database hiccup must never silence everyone's reminders. */
  if (supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: claimed, error } = await admin.rpc("claim_scheduler_tick");
    if (error) console.error("[notify-scheduler] throttle check failed", error.message);
    else if (claimed !== true) return reply(204);
  }

  try {
    const res = await fetch(`${appUrl}/api/public/push-tick`, {
      method: "POST",
      headers: { "x-push-secret": secret },
      signal: AbortSignal.timeout(55_000),
    });
    const text = await res.text();
    if (!res.ok) console.error(`[notify-scheduler] push-tick ${res.status}: ${text}`);
    else console.log(`[notify-scheduler] ${text}`);
    return reply(res.ok ? 204 : 502);
  } catch (error) {
    console.error("[notify-scheduler] push-tick unreachable", error);
    return reply(502);
  }
});
