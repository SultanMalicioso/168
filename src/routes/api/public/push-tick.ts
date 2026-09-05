import { createFileRoute } from "@tanstack/react-router";
import { planEvents, type TimerSnapshot } from "@/lib/notify-plan";
import type { NotifySettings } from "@/lib/notify-store";
import type { Store } from "@/lib/time-store";

/* ------------------------------------------------------------------ *
 * Scheduled push dispatcher.
 * Runs every minute from the database scheduler. For each registered
 * device it replays the very same planner the app uses, in the user's
 * own time zone, and pushes whatever became due — once, ever.
 * ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: NotifySettings = {
  enabled: true,
  morning: true,
  morningTime: "08:00",
  night: true,
  nightTime: "21:30",
  activities: true,
  tasks: true,
  pendingTasks: true,
  completions: false,
  quietEnabled: true,
  quietFrom: "23:00",
  quietTo: "07:00",
  defaultLead: 10,
};

const hhmmToMin = (v: string) => {
  const [h, m] = String(v).split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

function inQuietHours(s: NotifySettings, local: Date): boolean {
  if (!s.quietEnabled) return false;
  const now = local.getHours() * 60 + local.getMinutes();
  const from = hhmmToMin(s.quietFrom);
  const to = hhmmToMin(s.quietTo);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Offset in ms between UTC and the given IANA time zone at `date`. */
function tzOffsetMs(timeZone: string, date: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(
      Number(p['year']),
      Number(p['month']) - 1,
      Number(p['day']),
      Number(p['hour']) % 24,
      Number(p['minute']),
      Number(p['second']),
    );
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 0;
  }
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string;
}

export const Route = createFileRoute("/api/public/push-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PUSH_CRON_SECRET"];
        const provided =
          request.headers.get("x-push-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendWebPush, readVapid } = await import("@/lib/web-push.server");

        const vapid = readVapid();
        if (!vapid) return Response.json({ error: "vapid-missing" }, { status: 500 });

        const { data: subs, error } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth, time_zone")
          .eq("enabled", true)
          .limit(500);

        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (subs ?? []) as SubRow[];
        const byUser = new Map<string, SubRow[]>();
        for (const row of rows) {
          byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }

        const now = new Date();
        let sent = 0;
        let dropped = 0;

        for (const [userId, devices] of byUser) {
          const { data: dataRows } = await supabaseAdmin
            .from("user_data")
            .select("key, value")
            .eq("user_id", userId);

          const get = <T,>(key: string): T | null => {
            const raw = dataRows?.find((r) => r.key === key)?.value;
            if (raw == null) return null;
            try {
              return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
            } catch {
              return null;
            }
          };

          const store = get<Store>("week168.v2");
          if (!store || !Array.isArray(store.activities)) continue;
          store.tasks = Array.isArray(store.tasks) ? store.tasks : [];

          const timersRaw = get<Partial<TimerSnapshot>>("week168.timers.v1");
          const timers: TimerSnapshot = {
            completions:
              timersRaw?.completions && typeof timersRaw.completions === "object"
                ? timersRaw.completions
                : {},
            active: timersRaw?.active ?? null,
            sessions: Array.isArray(timersRaw?.sessions) ? timersRaw.sessions : [],
          };

          const notify = get<{ settings?: Partial<NotifySettings> }>("week168.notify.v1");
          const settings: NotifySettings = { ...DEFAULT_SETTINGS, ...(notify?.settings ?? {}) };
          if (!settings.enabled) continue;

          for (const device of devices) {
            const offset = tzOffsetMs(device.time_zone || "UTC", now);
            const local = new Date(now.getTime() + offset);
            if (inQuietHours(settings, local)) continue;

            const localMs = local.getTime();
            const events = planEvents(local, store, timers, settings).filter(
              (e) => e.at <= localMs && localMs - e.at <= Math.min(e.graceMs, 30 * 60_000),
            );
            if (events.length === 0) continue;

            /* Reserve the keys first: the ledger makes duplicates impossible. */
            const { data: reserved } = await supabaseAdmin
              .from("push_sent")
              .upsert(
                events.map((e) => ({ user_id: userId, dedupe_key: e.key })),
                { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
              )
              .select("dedupe_key");

            const fresh = new Set((reserved ?? []).map((r) => r.dedupe_key));
            const due = events.filter((e) => fresh.has(e.key)).sort((a, b) => a.at - b.at);

            for (const e of due) {
              const res = await sendWebPush(
                device,
                {
                  title: e.input.title,
                  body: e.input.body,
                  tag: e.input.tag ?? e.key,
                  link: e.input.link ?? "/",
                  kind: e.input.kind,
                  color: e.input.color,
                  activityId: e.input.activityId,
                  taskId: e.input.taskId,
                  at: Date.now(),
                },
                vapid,
              );

              if (res.ok) {
                sent++;
              } else if (res.expired) {
                dropped++;
                await supabaseAdmin.from("push_subscriptions").delete().eq("id", device.id);
                break;
              } else {
                console.error(`push failed [${res.status}]: ${res.body ?? ""}`);
              }
            }

            await supabaseAdmin
              .from("push_subscriptions")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", device.id);
          }
        }

        /* Keep the ledger small. */
        if (now.getMinutes() === 7) {
          await supabaseAdmin
            .from("push_sent")
            .delete()
            .lt("sent_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
        }

        return Response.json({ ok: true, devices: rows.length, sent, dropped });
      },
    },
  },
});
