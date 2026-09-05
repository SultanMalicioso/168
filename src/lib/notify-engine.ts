import { LOCAL_DATA_CHANGED_EVENT } from "@/lib/cloud-sync";
import { deliver, loadNotify, updateNotify } from "@/lib/notify-store";
import { planEvents, type TimerSnapshot } from "@/lib/notify-plan";
import type { Store } from "@/lib/time-store";
import { pushActiveHere } from "@/lib/push-client";

/* ------------------------------------------------------------------ *
 * In-page notification engine.
 * Runs while a tab is open. When this device is subscribed to server
 * push, deliveries are logged in the center only — the server owns the
 * OS notification so the two never duplicate.
 * ------------------------------------------------------------------ */

const STORE_KEY = "week168.v2";
const TIMER_KEY = "week168.timers.v1";

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readStore(): Store | null {
  const raw = readJSON<Store>(STORE_KEY);
  if (!raw || !Array.isArray(raw.activities)) return null;
  return { ...raw, tasks: Array.isArray(raw.tasks) ? raw.tasks : [] };
}

function readTimers(): TimerSnapshot {
  const raw = readJSON<Partial<TimerSnapshot>>(TIMER_KEY);
  return {
    completions: raw?.completions && typeof raw.completions === "object" ? raw.completions : {},
    active: raw?.active ?? null,
    sessions: Array.isArray(raw?.sessions) ? raw!.sessions! : [],
  };
}

/* ---------------- tick loop ---------------- */


let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const data = loadNotify();
    if (!data.settings.enabled) return;

    const store = readStore();
    if (!store) return;

    const now = new Date();
    const timers = readTimers();
    const events = planEvents(now, store, timers, data.settings);
    const nowMs = now.getTime();

    const due = events.filter(
      (e) => !data.sent[e.key] && e.at <= nowMs && nowMs - e.at <= e.graceMs,
    );

    if (due.length === 0) return;

    /* Reserve the keys first: no duplicates even if delivery is slow. */
    updateNotify((d) => {
      const sent = { ...d.sent };
      for (const e of due) sent[e.key] = nowMs;
      return { ...d, sent };
    });

    for (const e of due.sort((a, b) => a.at - b.at)) {
      await deliver(e.input, Math.max(e.at, nowMs - e.graceMs));
    }
  } finally {
    running = false;
  }
}

const schedule = () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void tick(), 800);
};

export function startNotifyEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  void tick();

  timer = setInterval(() => void tick(), 20_000);

  window.addEventListener(LOCAL_DATA_CHANGED_EVENT, (event) => {
    const key = (event as CustomEvent<{ key?: string }>).detail?.key;
    if (key === STORE_KEY || key === TIMER_KEY) schedule();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });

  window.addEventListener("focus", schedule);
}

export function stopNotifyEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
