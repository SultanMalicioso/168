import { useCallback, useEffect, useState } from "react";
import {
  activityDays,
  completionMode,
  type Activity,
  type Goal,
  type Task,
} from "@/lib/time-store";
import { getWeekKey } from "@/lib/week-utils";
import { dateKeyOf, isCompletedToday, realHoursForDay, type TimerData } from "@/lib/timer-store";

/* ------------------------------------------------------------------ *
 * Daily completion history
 * Single source of truth for the calendar (week / month / year views),
 * the day badges and every streak statistic. Past days are frozen as
 * snapshots so editing future activities never rewrites history.
 * Persisted in localStorage; shaped for a future cloud sync.
 * ------------------------------------------------------------------ */

export type DayStatus = "empty" | "not_started" | "in_progress" | "completed" | "incomplete";

export const DAY_STATUS_META: Record<DayStatus, { label: string; dot: string; color: string }> = {
  empty: { label: "Sin actividades", dot: "⚪", color: "oklch(0.78 0.01 250)" },
  not_started: { label: "Sin comenzar", dot: "⚪", color: "oklch(0.72 0.02 250)" },
  in_progress: { label: "En progreso", dot: "🟡", color: "oklch(0.78 0.16 85)" },
  completed: { label: "Completado", dot: "🟢", color: "oklch(0.7 0.16 155)" },
  incomplete: { label: "Incompleto", dot: "🔴", color: "oklch(0.63 0.21 25)" },
};

/* What the calendar shows for a day: a message and color by % completed. */
export interface DayLook {
  label: string;
  dot: string;
  color: string;
}

export const DAY_TIERS = {
  zero: { label: "Día en blanco", dot: "🔴", color: "oklch(0.62 0.21 25)" },
  low: { label: "Buen comienzo", dot: "🟠", color: "oklch(0.7 0.18 50)" },
  high: { label: "¡Casi completo!", dot: "🟡", color: "oklch(0.82 0.16 90)" },
  full: { label: "¡Día perfecto!", dot: "🟢", color: "oklch(0.64 0.17 155)" },
} satisfies Record<string, DayLook>;

const NEUTRAL: Record<"empty" | "upcoming" | "not_started", DayLook> = {
  empty: { label: "Sin actividades", dot: "⚪", color: "oklch(0.9 0.005 250)" },
  upcoming: { label: "Próximamente", dot: "⚪", color: "oklch(0.93 0.004 250)" },
  not_started: { label: "Sin comenzar", dot: "⚪", color: "oklch(0.88 0.01 250)" },
};

/** 0% red, 1–49% orange, 50–99% yellow, 100% green. */
export function tierFor(pct: number): DayLook {
  if (pct >= 100) return DAY_TIERS.full;
  if (pct >= 50) return DAY_TIERS.high;
  if (pct > 0) return DAY_TIERS.low;
  return DAY_TIERS.zero;
}

export function dayLook(d: DaySnapshot, now = Date.now()): DayLook {
  if (d.status === "empty") return d.pct >= 100 ? DAY_TIERS.full : NEUTRAL.empty;
  if (isFutureKey(d.dateKey, now)) return NEUTRAL.upcoming;
  // Today still has time ahead: 0% is "not started" until the day is over.
  if (!isPastKey(d.dateKey, now) && d.pct <= 0) return NEUTRAL.not_started;
  return tierFor(d.pct);
}

export interface DayActivityRecord {
  id: string;
  name: string;
  color: string;
  mode: "timer" | "manual";
  plannedHours: number;
  realHours: number;
  done: boolean;
}

export interface DaySnapshot {
  dateKey: string;
  dayIndex: number;
  total: number;
  done: number;
  pct: number;
  plannedHours: number;
  realHours: number;
  activities: DayActivityRecord[];
  tasksTotal: number;
  tasksDone: number;
  goals: { id: string; name: string; color: string; icon?: string; hours: number }[];
  sessions: number;
  sessionMinutes: number;
  status: DayStatus;
  /** Epoch ms when the day was frozen into history (absent = live value). */
  frozenAt?: number;
}

export type EmptyDayMode = "complete" | "ignore";

export interface HistoryData {
  /** dateKey → frozen snapshot of a finished day. */
  days: Record<string, DaySnapshot>;
  settings: { emptyDayMode: EmptyDayMode };
  version: 1;
}

const KEY = "week168.history.v1";

const DEFAULT: HistoryData = { days: {}, settings: { emptyDayMode: "ignore" }, version: 1 };

/* ---------------- date helpers ---------------- */

export const parseKey = (k: string) => new Date(k + "T00:00:00");
export const dayIndexOfKey = (k: string) => ((parseKey(k).getDay() + 6) % 7) as number;
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export function keysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  let d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    out.push(dateKeyOf(d));
    d = addDays(d, 1);
  }
  return out;
}
export const isPastKey = (k: string, now = Date.now()) => k < dateKeyOf(new Date(now));

/** Whether an activity was on the schedule for `dateKey`. */
function scheduledOn(a: Activity, dateKey: string): boolean {
  const date = parseKey(dateKey);
  if (!activityDays(a).has(dayIndexOfKey(dateKey))) return false;
  if (!a.permanent && a.weekStart && a.weekStart !== getWeekKey(date)) return false;
  if (a.createdAt && a.createdAt >= date.getTime() + 86_400_000) return false;
  return true;
}

/** A finished activity counts its planned time even if the timer wasn't used. */
const creditedHours = (real: number, planned: number, done: boolean) =>
  done ? Math.max(real, planned) : real;

function goalsFor(
  records: DayActivityRecord[],
  activities: Activity[],
  goals: Goal[],
): DaySnapshot["goals"] {
  const hours = new Map<string, number>();
  for (const rec of records) {
    if (rec.realHours <= 0) continue;
    const a = activities.find((x) => x.id === rec.id);
    for (const gid of a?.goalIds ?? []) hours.set(gid, (hours.get(gid) ?? 0) + rec.realHours);
  }
  return goals
    .filter((g) => (hours.get(g.id) ?? 0) > 0)
    .map((g) => ({ id: g.id, name: g.name, color: g.color, icon: g.icon, hours: hours.get(g.id)! }));
}
export const isFutureKey = (k: string, now = Date.now()) => k > dateKeyOf(new Date(now));

/* ---------------- pure computation ---------------- */

function taskCountsFor(dateKey: string, activities: Activity[], tasks: Task[]) {
  let total = 0;
  let done = 0;
  const seen = new Set<string>();
  const consider = (t: Task) => {
    if (!t || seen.has(t.id) || t.deletedAt) return;
    if (t.dueDate !== dateKey) return;
    seen.add(t.id);
    total++;
    if (t.status === "completed") done++;
  };
  for (const t of tasks ?? []) consider(t);
  for (const a of activities) for (const t of a.tasks ?? []) consider(t);
  return { total, done };
}

/** Share of the day's scheduled activities that were completed. */
function dayPct(total: number, done: number, emptyDayMode: EmptyDayMode): number {
  if (total === 0) return emptyDayMode === "complete" ? 100 : 0;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

/**
 * A frozen day keeps the activities that were scheduled then, but its
 * completions always come from the current timer data: a completion that
 * synced from another device after the day was frozen still counts.
 */
function refreshFrozen(
  snap: DaySnapshot,
  current: Activity[],
  goals: Goal[],
  timers: TimerData,
  emptyDayMode: EmptyDayMode,
): DaySnapshot {
  const hasCompletions = snap.dateKey in timers.completions;
  const activities = snap.activities
    .filter((rec) => {
      // Drop records that were frozen in by mistake (other week / created later).
      const a = current.find((x) => x.id === rec.id);
      return !a || scheduledOn(a, snap.dateKey);
    })
    .map((rec) => {
      const done = hasCompletions ? isCompletedToday(timers, rec.id, snap.dateKey) : rec.done;
      return { ...rec, done, realHours: creditedHours(rec.realHours, rec.plannedHours, done) };
    });
  const total = activities.length;
  const done = activities.filter((a) => a.done).length;
  const status: DayStatus =
    total === 0
      ? emptyDayMode === "complete"
        ? "completed"
        : "empty"
      : done === total
        ? "completed"
        : "incomplete";
  return {
    ...snap,
    activities,
    total,
    done,
    pct: dayPct(total, done, emptyDayMode),
    status,
    plannedHours: activities.reduce((t, a) => t + a.plannedHours, 0),
    realHours: activities.reduce((t, a) => t + a.realHours, 0),
    goals: goalsFor(activities, current, goals),
  };
}

/** Live computation of a day from the current data. */
export function computeDay(
  dateKey: string,
  activities: Activity[],
  goals: Goal[],
  tasks: Task[],
  timers: TimerData,
  emptyDayMode: EmptyDayMode,
  now = Date.now(),
): DaySnapshot {
  const dayIndex = dayIndexOfKey(dateKey);
  const scheduled = activities.filter((a) => scheduledOn(a, dateKey));

  const records: DayActivityRecord[] = scheduled.map((a) => {
    const done = isCompletedToday(timers, a.id, dateKey);
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      mode: completionMode(a),
      plannedHours: a.hoursPerDay,
      realHours: creditedHours(
        realHoursForDay(timers, a, dateKey, a.hoursPerDay, now),
        a.hoursPerDay,
        done,
      ),
      done,
    };
  });

  const total = records.length;
  const done = records.filter((r) => r.done).length;
  const plannedHours = records.reduce((s, r) => s + r.plannedHours, 0);
  const realHours = records.reduce((s, r) => s + r.realHours, 0);
  const pct = dayPct(total, done, emptyDayMode);

  const goalList = goalsFor(records, activities, goals);

  const daySessions = timers.sessions.filter((s) => s.dateKey === dateKey);
  const t = taskCountsFor(dateKey, activities, tasks);

  let status: DayStatus;
  if (total === 0) {
    status = emptyDayMode === "complete" ? "completed" : "empty";
  } else if (done === total) {
    status = "completed";
  } else if (isPastKey(dateKey, now)) {
    status = "incomplete";
  } else if (done > 0 || realHours > 0.01 || t.done > 0) {
    status = "in_progress";
  } else {
    status = "not_started";
  }

  return {
    dateKey,
    dayIndex,
    total,
    done,
    pct,
    plannedHours,
    realHours,
    activities: records,
    tasksTotal: t.total,
    tasksDone: t.done,
    goals: goalList,
    sessions: daySessions.length,
    sessionMinutes: Math.round(daySessions.reduce((s, x) => s + x.durationMs, 0) / 60000),
    status,
  };
}

/* ---------------- statistics ---------------- */

export interface HistoryStats {
  completed: number;
  incomplete: number;
  inProgress: number;
  tracked: number;
  compliance: number;
  /** Activities completed / scheduled across the period (today included). */
  activitiesDone: number;
  activitiesTotal: number;
  activityPct: number;
  currentStreak: number;
  bestStreak: number;
  weeklyAvg: number;
  monthlyAvg: number;
  yearlyAvg: number;
  totalHours: number;
  bestActivity: { name: string; pct: number } | null;
  worstActivity: { name: string; pct: number } | null;
}

export function computeStats(days: DaySnapshot[], now = Date.now()): HistoryStats {
  const counted = days.filter((d) => d.status !== "empty" && !isFutureKey(d.dateKey, now));
  const completed = counted.filter((d) => d.status === "completed").length;
  const incomplete = counted.filter((d) => d.status === "incomplete").length;
  const inProgress = counted.filter((d) => d.status === "in_progress").length;
  const compliance = counted.length ? (completed / counted.length) * 100 : 0;
  const totalHours = days.reduce((s, d) => s + d.realHours, 0);
  const activitiesDone = counted.reduce((s, d) => s + d.done, 0);
  const activitiesTotal = counted.reduce((s, d) => s + d.total, 0);
  const activityPct = activitiesTotal ? (activitiesDone / activitiesTotal) * 100 : 0;

  // Streaks over the chronological, non-future timeline (empty days are neutral).
  const ordered = [...counted].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  let best = 0;
  let run = 0;
  for (const d of ordered) {
    if (d.status === "completed") {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  let current = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].status === "completed") current++;
    else break;
  }

  const avg = (n: number) => (counted.length ? (completed / counted.length) * n : 0);

  const perActivity = new Map<string, { name: string; total: number; done: number }>();
  for (const d of counted) {
    for (const a of d.activities) {
      const e = perActivity.get(a.id) ?? { name: a.name, total: 0, done: 0 };
      e.name = a.name;
      e.total++;
      if (a.done) e.done++;
      perActivity.set(a.id, e);
    }
  }
  const ranked = [...perActivity.values()]
    .map((e) => ({ name: e.name, pct: e.total ? (e.done / e.total) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  return {
    completed,
    incomplete,
    inProgress,
    tracked: counted.length,
    compliance,
    activitiesDone,
    activitiesTotal,
    activityPct,
    currentStreak: current,
    bestStreak: best,
    weeklyAvg: avg(7),
    monthlyAvg: avg(30),
    yearlyAvg: avg(365),
    totalHours,
    bestActivity: ranked[0] ?? null,
    worstActivity: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

/* ---------------- persistence + pub/sub ---------------- */

let memory: HistoryData = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): HistoryData {
  const r = (raw ?? {}) as Partial<HistoryData>;
  return {
    days: r.days && typeof r.days === "object" ? (r.days as Record<string, DaySnapshot>) : {},
    settings: {
      emptyDayMode: r.settings?.emptyDayMode === "complete" ? "complete" : "ignore",
    },
    version: 1,
  };
}

function load(): HistoryData {
  if (loaded) return memory;
  loaded = true;
  if (typeof window === "undefined") return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = sanitize(JSON.parse(raw));
  } catch {
    /* corrupted payload */
  }
  return memory;
}

function commit(next: HistoryData) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
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

/* ---------------- hook ---------------- */

export interface DaySource {
  activities: Activity[];
  goals: Goal[];
  tasks: Task[];
  timers: TimerData;
  now?: number;
}

export function useHistoryStore(source: DaySource) {
  const [data, setData] = useState<HistoryData>(() =>
    typeof window === "undefined" ? DEFAULT : load(),
  );

  useEffect(() => {
    setData(load());
    const l = () => setData({ ...memory });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const emptyDayMode = data.settings.emptyDayMode;
  const now = source.now ?? Date.now();

  /** Single source of truth: frozen snapshot for past days, live otherwise. */
  const getDay = useCallback(
    (dateKey: string): DaySnapshot => {
      const frozen = data.days[dateKey];
      if (frozen && isPastKey(dateKey, now))
        return refreshFrozen(frozen, source.activities, source.goals, source.timers, emptyDayMode);
      return computeDay(
        dateKey,
        source.activities,
        source.goals,
        source.tasks,
        source.timers,
        emptyDayMode,
        now,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, source.activities, source.goals, source.tasks, source.timers, emptyDayMode, now],
  );

  const getDays = useCallback((keys: string[]) => keys.map(getDay), [getDay]);

  const setEmptyDayMode = useCallback((emptyDayMode: EmptyDayMode) => {
    commit({ ...memory, settings: { ...memory.settings, emptyDayMode } });
  }, []);

  const clearHistory = useCallback(() => commit({ ...memory, days: {} }), []);

  /**
   * Freeze finished days that carry real data. Runs on mount and whenever the
   * source changes, so a day rolls into history automatically at midnight.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const relevant = new Set<string>();
    for (const s of source.timers.sessions) relevant.add(s.dateKey);
    for (const k of Object.keys(source.timers.completions)) {
      if ((source.timers.completions[k] ?? []).length > 0) relevant.add(k);
    }
    const patch: Record<string, DaySnapshot> = {};
    for (const k of relevant) {
      if (!isPastKey(k, now) || memory.days[k]) continue;
      patch[k] = {
        ...computeDay(
          k,
          source.activities,
          source.goals,
          source.tasks,
          source.timers,
          emptyDayMode,
          now,
        ),
        frozenAt: Date.now(),
      };
    }
    if (Object.keys(patch).length) commit({ ...memory, days: { ...memory.days, ...patch } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.activities, source.timers, emptyDayMode]);

  return {
    data,
    settings: data.settings,
    emptyDayMode,
    getDay,
    getDays,
    setEmptyDayMode,
    clearHistory,
  };
}
