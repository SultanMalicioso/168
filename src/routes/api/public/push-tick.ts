import { createFileRoute } from "@tanstack/react-router";
import {
  planEvents,
  withoutFinishedTimerDuplicate,
  type PlannedEvent,
  type TimerSnapshot,
} from "@/lib/notify-plan";
import type { Json } from "@/integrations/supabase/types";
import type { NotifySettings } from "@/lib/notify-store";
import { DEFAULT_NOTIFY_SETTINGS } from "@/lib/notify-defaults";
import type { Store } from "@/lib/time-store";

/* ------------------------------------------------------------------ *
 * Scheduled push dispatcher.
 * Called on a schedule by the Supabase `notify-scheduler` edge function
 * (pg_cron). For each registered device it replays the very same planner the app uses, in the user's
 * own time zone, and pushes whatever became due — once, ever.
 * ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = DEFAULT_NOTIFY_SETTINGS;

const hhmmToMin = (v: string) => {
  const [h, m] = String(v)
    .split(":")
    .map((n) => parseInt(n, 10));
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
      Number(p["year"]),
      Number(p["month"]) - 1,
      Number(p["day"]),
      Number(p["hour"]) % 24,
      Number(p["minute"]),
      Number(p["second"]),
    );
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 0;
  }
}

/**
 * The push service says the subscription belongs to another VAPID key
 * (Apple: 400 VapidPkHashMismatch; FCM: 403 "...do not correspond...").
 */
function isOtherVapidKey(status: number, body?: string): boolean {
  return (
    (status === 400 || status === 403) &&
    /VapidPkHashMismatch|do not correspond to the credentials/i.test(body ?? "")
  );
}

interface ActiveTimerRow {
  id: string;
  activityId: string;
  plannedMs: number;
  startedAt: number | null;
  elapsedMs: number;
  status: "running" | "paused";
  dateKey: string;
  sessionStart: number;
}

/**
 * Completes a running timer whose time is up (same shape the app's
 * timer store writes when it finishes a session itself).
 */
function finishExpiredTimer(raw: Record<string, unknown> | null, nowMs: number) {
  const a = raw?.active as ActiveTimerRow | null | undefined;
  if (!raw || !a || a.status !== "running" || !a.startedAt || !a.plannedMs) return null;
  const elapsed = (a.elapsedMs ?? 0) + Math.max(0, nowMs - a.startedAt);
  // An open app finishes (and uploads) its timer at the exact second, so
  // by the next tick the server only sees timers whose app was closed.
  if (elapsed < a.plannedMs) return null;

  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : []) as { id?: string }[];
  const completions = {
    ...((raw.completions && typeof raw.completions === "object" ? raw.completions : {}) as Record<
      string,
      string[]
    >),
  };
  completions[a.dateKey] = Array.from(new Set([...(completions[a.dateKey] ?? []), a.activityId]));

  const session = {
    id: a.id,
    activityId: a.activityId,
    dateKey: a.dateKey,
    startedAt: a.sessionStart,
    endedAt: a.startedAt + (a.plannedMs - (a.elapsedMs ?? 0)),
    durationMs: a.plannedMs,
    plannedMs: a.plannedMs,
    completed: true,
  };

  return {
    timer: a,
    data: {
      ...raw,
      active: null,
      sessions: [...sessions.filter((x) => x.id !== a.id), session] as TimerSnapshot["sessions"],
      completions,
    },
  };
}

const SUBS_BATCH = 500;

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
        const { hit, blockedFor, clientIp, safeEqual, tooManyRequests, WINDOW_15_MIN } =
          await import("@/lib/rate-limit.server");
        const ip = clientIp(request);
        const failKey = `push-tick:fail:${ip}`;

        /* Authenticated route: max 5 failed attempts per IP every 15 minutes. */
        const locked = blockedFor(failKey, 5);
        if (locked > 0) return tooManyRequests(locked);

        // The cron has no body; reject anything sizeable outright.
        if (Number(request.headers.get("content-length") ?? 0) > 1024) {
          return new Response("Payload too large", { status: 413 });
        }

        const secret = process.env["PUSH_CRON_SECRET"] ?? "";
        const provided =
          request.headers.get("x-push-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!secret || !safeEqual(provided, secret)) {
          hit(failKey, 5, WINDOW_15_MIN);
          return new Response("Unauthorized", { status: 401 });
        }

        /* Valid calls (the cron, once a minute) are capped too, so a leaked secret can't hammer the push services. */
        const wait = hit("push-tick:ok", 60, WINDOW_15_MIN);
        if (wait > 0) return tooManyRequests(wait);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendWebPush, readVapid } = await import("@/lib/web-push.server");

        const vapid = readVapid();
        if (!vapid) return Response.json({ error: "vapid-missing" }, { status: 500 });

        /* Every enabled subscription, read in batches so none is left out. */
        const rows: SubRow[] = [];
        for (let from = 0; ; from += SUBS_BATCH) {
          const { data: subs, error } = await supabaseAdmin
            .from("push_subscriptions")
            .select("id, user_id, endpoint, p256dh, auth, time_zone")
            .eq("enabled", true)
            .order("id")
            .range(from, from + SUBS_BATCH - 1);

          if (error) return Response.json({ error: error.message }, { status: 500 });
          rows.push(...((subs ?? []) as SubRow[]));
          if (!subs || subs.length < SUBS_BATCH) break;
        }

        const byUser = new Map<string, SubRow[]>();
        for (const row of rows) {
          byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }

        const now = new Date();
        let sent = 0;
        let dropped = 0;
        let failed = 0;

        for (const [userId, devices] of byUser) {
          const { data: dataRows } = await supabaseAdmin
            .from("user_data")
            .select("key, value")
            .eq("user_id", userId);

          const get = <T>(key: string): T | null => {
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

          /* A timer that ran out while every device was closed: complete it here. */
          const expired = finishExpiredTimer(
            get<Record<string, unknown>>("week168.timers.v1"),
            Date.now(),
          );
          let timerEvent: PlannedEvent | null = null;
          let finishedTimer: { activityId: string; dateKey: string } | null = null;
          if (expired) {
            const { error: saveError } = await supabaseAdmin
              .from("user_data")
              .upsert(
                { user_id: userId, key: "week168.timers.v1", value: expired.data as Json },
                { onConflict: "user_id,key" },
              );
            if (saveError) {
              console.error(`timer finish failed [${userId}]: ${saveError.message}`);
            } else {
              timers.active = null;
              timers.completions = expired.data.completions;
              timers.sessions = expired.data.sessions;
              finishedTimer = {
                activityId: expired.timer.activityId,
                dateKey: expired.timer.dateKey,
              };
              const act = store.activities.find((a) => a.id === expired.timer.activityId);
              timerEvent = {
                key: `timer:${expired.timer.id}`,
                at: 0,
                graceMs: Number.MAX_SAFE_INTEGER,
                input: {
                  kind: "activity",
                  title: `✅ ${act?.name ?? "Actividad"} completada`,
                  body: "Se cumplió el tiempo del temporizador.",
                  tag: `timer:${expired.timer.id}`,
                  color: act?.color,
                  activityId: expired.timer.activityId,
                  link: "/",
                },
              };
            }
          }

          const notify = get<{ settings?: Partial<NotifySettings> }>("week168.notify.v1");
          const settings: NotifySettings = { ...DEFAULT_SETTINGS, ...(notify?.settings ?? {}) };
          if (!settings.enabled) continue;

          for (const device of devices) {
            const offset = tzOffsetMs(device.time_zone || "UTC", now);
            const local = new Date(now.getTime() + offset);
            if (inQuietHours(settings, local)) continue;

            const localMs = local.getTime();
            let events = planEvents(local, store, timers, settings).filter(
              (e) => e.at <= localMs && localMs - e.at <= Math.min(e.graceMs, 30 * 60_000),
            );
            if (finishedTimer) events = withoutFinishedTimerDuplicate(events, finishedTimer);
            if (timerEvent) events.push(timerEvent);
            if (events.length === 0) continue;

            /*
             * Reserve the keys first: the ledger makes duplicates impossible.
             * Keys are per device, so every registered device gets the event
             * (a per-user key let the first device in the list claim it).
             */
            const ledgerKey = (key: string) => `${device.id}:${key}`;
            const { data: reserved } = await supabaseAdmin
              .from("push_sent")
              .upsert(
                events.map((e) => ({ user_id: userId, dedupe_key: ledgerKey(e.key) })),
                { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
              )
              .select("dedupe_key");

            const fresh = new Set((reserved ?? []).map((r) => r.dedupe_key));
            const due = events
              .filter((e) => fresh.has(ledgerKey(e.key)))
              .sort((a, b) => a.at - b.at);

            for (const e of due) {
              let res: Awaited<ReturnType<typeof sendWebPush>>;
              try {
                res = await sendWebPush(
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
              } catch (err) {
                /* One broken subscription must not stop the whole tick. */
                failed++;
                console.error(`push exception [${device.id}]`, err);
                break;
              }

              if (res.ok) {
                sent++;
              } else if (res.expired) {
                dropped++;
                await supabaseAdmin.from("push_subscriptions").delete().eq("id", device.id);
                break;
              } else if (isOtherVapidKey(res.status, res.body)) {
                /* Created with an old VAPID key: it can never work again. */
                dropped++;
                await supabaseAdmin
                  .from("push_subscriptions")
                  .update({ enabled: false })
                  .eq("id", device.id);
                break;
              } else {
                failed++;
                console.error(`push failed [${device.id}] [${res.status}]: ${res.body ?? ""}`);
              }
            }

            await supabaseAdmin
              .from("push_subscriptions")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", device.id);
          }
        }

        /* Keep the ledger small (the scheduler may run every 1 or 5 minutes). */
        if (now.getMinutes() < 5) {
          await supabaseAdmin
            .from("push_sent")
            .delete()
            .lt("sent_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
        }

        return Response.json({ ok: true, devices: rows.length, sent, dropped, failed });
      },
    },
  },
});
