import { useCallback, useEffect, useState } from "react";
import { activityDays, completionMode, type Activity } from "@/lib/time-store";

/* ------------------------------------------------------------------ *
 * Timer store
 * Independent, persisted, event-driven store for real-time activity
 * sessions. Designed to be extended later with pomodoro, breaks,
 * multiple timers and cloud sync without breaking the public API.
 * ------------------------------------------------------------------ */

export type TimerStatus = "running" | "paused";

export interface ActiveTimer {
  id: string;
  activityId: string;
  /** Planned duration for this session in ms. */
  plannedMs: number;
  /** Epoch ms of the last resume (null when paused). */
  startedAt: number | null;
  /** Accumulated ms before the last resume. */
  elapsedMs: number;
  status: TimerStatus;
  /** Local day (yyyy-mm-dd) the session belongs to. */
  dateKey: string;
  /** Epoch ms when the session was first started. */
  sessionStart: number;
  /** Reserved for future modes: "activity" | "pomodoro" | "break" | "free". */
  mode: "activity";
}

export interface TimerSession {
  id: string;
  activityId: string;
  dateKey: string;
  startedAt: number;
  endedAt: number;
  /** Effective worked ms (excludes paused time). */
  durationMs: number;
  plannedMs: number;
  /** true when it ran to completion, false when stopped early. */
  completed: boolean;
}

export interface TimerSettings {
  sound: boolean;
  notifications: boolean;
  /** Ask before auto-completing tasks of the activity. Always true today. */
  askTasks: boolean;
}

export interface TimerData {
  active: ActiveTimer | null;
  sessions: TimerSession[];
  settings: TimerSettings;
  /** dateKey → activityIds completed that day. */
  completions: Record<string, string[]>;
  /** Chart/stat mode: planned time vs really tracked time. */
  progressMode: "planned" | "real";
}

const KEY = "week168.timers.v1";

const DEFAULT: TimerData = {
  active: null,
  sessions: [],
  settings: { sound: true, notifications: true, askTasks: true },
  completions: {},
  progressMode: "planned",
};

export const tuid = () => Math.random().toString(36).slice(2, 10);

export function dateKeyOf(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO weekday index, Monday = 0. */
export const dayIndexOf = (d: Date = new Date()) => ((d.getDay() + 6) % 7) as number;

/** Monday 00:00 of the week containing `d`. */
export function weekStart(d: Date = new Date()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - dayIndexOf(d));
  return s;
}

/* ---------------- persistence + pub/sub ---------------- */

let memory: TimerData = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): TimerData {
  const r = (raw ?? {}) as Partial<TimerData>;
  return {
    active: r.active && typeof r.active === "object" ? (r.active as ActiveTimer) : null,
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    settings: { ...DEFAULT.settings, ...(r.settings ?? {}) },
    completions:
      r.completions && typeof r.completions === "object" ? (r.completions as Record<string, string[]>) : {},
    progressMode: r.progressMode === "real" ? "real" : "planned",
  };
}

function load(): TimerData {
  if (loaded) return memory;
  loaded = true;
  if (typeof window === "undefined") return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = sanitize(JSON.parse(raw));
  } catch {
    /* ignore corrupted payloads */
  }
  return memory;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* quota / private mode */
  }
}

function commit(next: TimerData) {
  memory = next;
  persist();
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      memory = sanitize(e.newValue ? JSON.parse(e.newValue) : null);
    } catch {
      memory = DEFAULT;
    }
    listeners.forEach((l) => l());
  });
}

/* ---------------- selectors ---------------- */

export function elapsedMs(t: ActiveTimer | null, now = Date.now()): number {
  if (!t) return 0;
  // Wall-clock based: survives reloads, tab switches and throttled intervals.
  return t.status === "running" && t.startedAt ? t.elapsedMs + Math.max(0, now - t.startedAt) : t.elapsedMs;
}

export function remainingMs(t: ActiveTimer | null, now = Date.now()): number {
  if (!t) return 0;
  return Math.max(0, t.plannedMs - elapsedMs(t, now));
}

export function timerPct(t: ActiveTimer | null, now = Date.now()): number {
  if (!t || t.plannedMs <= 0) return 0;
  return Math.min(100, (elapsedMs(t, now) / t.plannedMs) * 100);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** Tracked hours for an activity on a given day (sessions + live timer). */
export function doneHoursForDay(
  data: TimerData,
  activityId: string,
  dateKey: string,
  now = Date.now(),
): number {
  let ms = 0;
  for (const s of data.sessions) {
    if (s.activityId === activityId && s.dateKey === dateKey) ms += s.durationMs;
  }
  const a = data.active;
  if (a && a.activityId === activityId && a.dateKey === dateKey) ms += elapsedMs(a, now);
  return ms / 3_600_000;
}

/** Tracked hours for an activity across the current week. */
export function doneHoursForWeek(data: TimerData, activityId: string, now = Date.now()): number {
  const start = weekStart(new Date(now)).getTime();
  const end = start + 7 * 86_400_000;
  let ms = 0;
  for (const s of data.sessions) {
    if (s.activityId !== activityId) continue;
    if (s.startedAt >= start && s.startedAt < end) ms += s.durationMs;
  }
  const a = data.active;
  if (a && a.activityId === activityId && a.sessionStart >= start) ms += elapsedMs(a, now);
  return ms / 3_600_000;
}

export interface ActivityTimerStats {
  sessions: number;
  doneHoursToday: number;
  doneHoursWeek: number;
  totalHours: number;
  plannedWeek: number;
  diffWeek: number;
  compliance: number;
}

export function activityStats(
  data: TimerData,
  activity: Activity,
  now = Date.now(),
): ActivityTimerStats {
  const totalMs = data.sessions
    .filter((s) => s.activityId === activity.id)
    .reduce((sum, s) => sum + s.durationMs, 0);
  const doneWeek = doneHoursForWeek(data, activity.id, now);
  const plannedWeek = activity.hoursPerDay * activity.daysPerWeek;
  return {
    sessions: data.sessions.filter((s) => s.activityId === activity.id).length,
    doneHoursToday: doneHoursForDay(data, activity.id, dateKeyOf(new Date(now)), now),
    doneHoursWeek: doneWeek,
    totalHours: totalMs / 3_600_000,
    plannedWeek,
    diffWeek: doneWeek - plannedWeek,
    compliance: plannedWeek > 0 ? (doneWeek / plannedWeek) * 100 : 0,
  };
}

export function isCompletedToday(data: TimerData, activityId: string, dateKey = dateKeyOf()): boolean {
  return (data.completions[dateKey] ?? []).includes(activityId);
}

/* ---------- unified completion (timer + manual) ---------- */

/**
 * Effective "real" hours of an activity on a day, regardless of how it is
 * completed: manual activities count their planned hours once marked done,
 * timer activities count tracked session time.
 */
export function realHoursForDay(
  data: TimerData,
  activity: Activity,
  dateKey: string,
  plannedHours?: number,
  now = Date.now(),
): number {
  if (completionMode(activity) === "manual") {
    return isCompletedToday(data, activity.id, dateKey) ? (plannedHours ?? activity.hoursPerDay) : 0;
  }
  return doneHoursForDay(data, activity.id, dateKey, now);
}

/** Same idea across the current week. */
export function realHoursForWeek(data: TimerData, activity: Activity, now = Date.now()): number {
  if (completionMode(activity) === "manual") {
    const start = weekStart(new Date(now));
    let hours = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (isCompletedToday(data, activity.id, dateKeyOf(d))) hours += activity.hoursPerDay;
    }
    return hours;
  }
  return doneHoursForWeek(data, activity.id, now);
}

/** A day is complete when every activity scheduled that day is finished. */
export function dayCompletion(
  data: TimerData,
  activities: Activity[],
  dayIndex: number,
  dateKey: string,
): { total: number; done: number; complete: boolean } {
  const scheduled = activities.filter((a) => activityDays(a).has(dayIndex));
  const done = scheduled.filter((a) => isCompletedToday(data, a.id, dateKey)).length;
  return { total: scheduled.length, done, complete: scheduled.length > 0 && done === scheduled.length };
}


/* ---------------- hook ---------------- */

export function useTimerStore(opts?: { tickFor?: string | null }) {
  const [data, setData] = useState<TimerData>(() => (typeof window === "undefined" ? DEFAULT : load()));
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setData(load());
    setHydrated(true);
    const l = () => setData(memory);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Tick only while a timer is running — keeps the app idle otherwise.
  const tickFor = opts?.tickFor;
  const running =
    data.active?.status === "running" &&
    (tickFor === undefined || tickFor === null || data.active.activityId === tickFor);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [running]);

  const update = useCallback((fn: (d: TimerData) => TimerData) => {
    commit(fn(memory));
  }, []);

  /* actions */

  const start = useCallback(
    (activity: Activity, plannedHours?: number, dateKey = dateKeyOf()) => {
      const hours = plannedHours ?? activity.hoursPerDay;
      const at = Date.now();
      update((d) => ({
        ...d,
        active: {
          id: tuid(),
          activityId: activity.id,
          plannedMs: Math.max(1000, Math.round(hours * 3_600_000)),
          startedAt: at,
          elapsedMs: 0,
          status: "running",
          dateKey,
          sessionStart: at,
          mode: "activity",
        },
      }));
    },
    [update],
  );

  const pause = useCallback(() => {
    update((d) => {
      const a = d.active;
      if (!a || a.status !== "running") return d;
      return {
        ...d,
        active: { ...a, elapsedMs: elapsedMs(a), startedAt: null, status: "paused" },
      };
    });
  }, [update]);

  const resume = useCallback(() => {
    update((d) => {
      const a = d.active;
      if (!a || a.status !== "paused") return d;
      return { ...d, active: { ...a, startedAt: Date.now(), status: "running" } };
    });
  }, [update]);

  const reset = useCallback(() => {
    update((d) => {
      const a = d.active;
      if (!a) return d;
      return { ...d, active: { ...a, elapsedMs: 0, startedAt: Date.now(), status: "running" } };
    });
  }, [update]);

  /** Ends the active session, recording it. Returns the stored session. */
  const finish = useCallback(
    (completed: boolean): { session: TimerSession; activityId: string } | null => {
      const a = memory.active;
      if (!a) return null;
      const ended = Date.now();
      const session: TimerSession = {
        id: tuid(),
        activityId: a.activityId,
        dateKey: a.dateKey,
        startedAt: a.sessionStart,
        endedAt: ended,
        durationMs: Math.min(elapsedMs(a, ended), a.plannedMs),
        plannedMs: a.plannedMs,
        completed,
      };
      update((d) => {
        const list = d.completions[a.dateKey] ?? [];
        return {
          ...d,
          active: null,
          sessions: [...d.sessions, session],
          completions: completed
            ? { ...d.completions, [a.dateKey]: Array.from(new Set([...list, a.activityId])) }
            : d.completions,
        };
      });
      return { session, activityId: a.activityId };
    },
    [update],
  );

  const cancel = useCallback(() => update((d) => ({ ...d, active: null })), [update]);

  const setSettings = useCallback(
    (patch: Partial<TimerSettings>) =>
      update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    [update],
  );

  const setProgressMode = useCallback(
    (progressMode: TimerData["progressMode"]) => update((d) => ({ ...d, progressMode })),
    [update],
  );

  const toggleCompletion = useCallback(
    (activityId: string, dateKey = dateKeyOf()) =>
      update((d) => {
        const list = d.completions[dateKey] ?? [];
        const next = list.includes(activityId)
          ? list.filter((x) => x !== activityId)
          : [...list, activityId];
        return { ...d, completions: { ...d.completions, [dateKey]: next } };
      }),
    [update],
  );

  const clearSessions = useCallback(
    () => update((d) => ({ ...d, sessions: [], completions: {} })),
    [update],
  );

  return {
    data,
    hydrated,
    now,
    active: data.active,
    settings: data.settings,
    progressMode: data.progressMode,
    start,
    pause,
    resume,
    reset,
    finish,
    cancel,
    setSettings,
    setProgressMode,
    toggleCompletion,
    clearSessions,
  };
}

/** Small helper for the completion chime (no assets needed). */
export function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1108.73, 1318.51];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
    window.setTimeout(() => void ctx.close(), 1400);
  } catch {
    /* audio not available */
  }
}
