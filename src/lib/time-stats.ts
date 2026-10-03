import { CATEGORIES, weeklyHours, type Activity, type Category } from "@/lib/time-store";
import { realHoursForWeek, type TimerData, type TimerSession } from "@/lib/timer-store";
import { addWeeks, getWeekKey } from "@/lib/week-utils";

/* ------------------------------------------------------------------ *
 * Week statistics built on the app's own definitions:
 * planned = weeklyHours, real = realHoursForWeek (timer + manual checks),
 * and the same "which activities belong to a week" rule as the dashboard.
 * ------------------------------------------------------------------ */

/** Activities shown in a week: permanent ones, plus those scheduled for it. */
export function activitiesInWeek(
  activities: Activity[],
  weekKey: string,
  currentWeek: string = getWeekKey(),
): Activity[] {
  return activities.filter((a) => {
    if (a.permanent) return true;
    // Legacy temporary activities without weekStart belong to the current week.
    if (!a.weekStart) return weekKey === currentWeek;
    return a.weekStart === weekKey;
  });
}

/** Reference instant used to measure a week's timer data (same as the dashboard). */
export const weekReference = (
  weekKey: string,
  now: number,
  currentWeek = getWeekKey(new Date(now)),
) => (weekKey === currentWeek ? now : new Date(`${weekKey}T12:00:00`).getTime());

export interface ActivityWeekStat {
  id: string;
  name: string;
  color: string;
  category: Category;
  planned: number;
  real: number;
}

export interface CategoryWeekStat {
  category: Category;
  label: string;
  color: string;
  planned: number;
  real: number;
}

export interface WeekStats {
  weekKey: string;
  planned: number;
  real: number;
  activities: ActivityWeekStat[];
  /** Only categories with planned or real time, ordered by real then planned hours. */
  categories: CategoryWeekStat[];
}

export interface StatsFilter {
  category?: Category | "all";
  activityId?: string | "all";
}

const matches = (a: Activity, f: StatsFilter) =>
  (!f.category || f.category === "all" || a.category === f.category) &&
  (!f.activityId || f.activityId === "all" || a.id === f.activityId);

export function computeWeekStats(
  activities: Activity[],
  timers: TimerData,
  weekKey: string,
  now: number,
  filter: StatsFilter = {},
): WeekStats {
  const currentWeek = getWeekKey(new Date(now));
  const ref = weekReference(weekKey, now, currentWeek);
  const rows: ActivityWeekStat[] = activitiesInWeek(activities, weekKey, currentWeek)
    .filter((a) => matches(a, filter))
    .map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      category: a.category,
      planned: weeklyHours(a),
      real: realHoursForWeek(timers, a, ref),
    }));

  const categories: CategoryWeekStat[] = CATEGORIES.map((c) => {
    const inCat = rows.filter((r) => r.category === c.id);
    return {
      category: c.id,
      label: c.label,
      color: c.color,
      planned: inCat.reduce((s, r) => s + r.planned, 0),
      real: inCat.reduce((s, r) => s + r.real, 0),
    };
  })
    .filter((c) => c.planned > 0 || c.real > 0)
    .sort((x, y) => y.real - x.real || y.planned - x.planned);

  return {
    weekKey,
    planned: rows.reduce((s, r) => s + r.planned, 0),
    real: rows.reduce((s, r) => s + r.real, 0),
    activities: rows.sort((x, y) => y.real - x.real || y.planned - x.planned),
    categories,
  };
}

/** The `count` weeks ending at `weekKey` (oldest first). */
export const weekKeysEndingAt = (weekKey: string, count: number) =>
  Array.from({ length: count }, (_, i) => addWeeks(weekKey, i - count + 1));

/**
 * Real hours per category averaged over the previous weeks that have any
 * tracked time; null when none of them do.
 */
export function averageOfWeeks(weeks: WeekStats[]): {
  weeks: number;
  real: number;
  byCategory: Map<Category, number>;
} | null {
  const withData = weeks.filter((w) => w.real > 0);
  if (withData.length === 0) return null;
  const byCategory = new Map<Category, number>();
  for (const w of withData)
    for (const c of w.categories)
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.real / withData.length);
  return {
    weeks: withData.length,
    real: withData.reduce((s, w) => s + w.real, 0) / withData.length,
    byCategory,
  };
}

/* ---------------- when time is actually tracked ---------------- */

export interface HourlyActivity {
  /** Hours tracked per [weekday 0 = Monday][hour of day 0–23]. */
  cells: number[][];
  total: number;
}

/**
 * Timer hours spread over weekday × hour of day, for sessions inside the
 * given weeks. Paused time is spread evenly across each session.
 * `activityIds` limits it to those activities (null = all).
 */
export function hourlyActivity(
  sessions: TimerSession[],
  weekKeys: string[],
  activityIds: Set<string> | null,
): HourlyActivity {
  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let total = 0;
  if (weekKeys.length === 0) return { cells, total };
  const from = new Date(`${weekKeys[0]}T00:00:00`).getTime();
  const to = new Date(`${addWeeks(weekKeys[weekKeys.length - 1], 1)}T00:00:00`).getTime();

  for (const s of sessions) {
    if (activityIds && !activityIds.has(s.activityId)) continue;
    const span = s.endedAt - s.startedAt;
    if (span <= 0 || s.durationMs <= 0) continue;
    const ratio = Math.min(1, s.durationMs / span);
    let t = Math.max(s.startedAt, from);
    const end = Math.min(s.endedAt, to);
    while (t < end) {
      const d = new Date(t);
      const next = Math.min(
        end,
        new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime(),
      );
      const h = ((next - t) * ratio) / 3_600_000;
      cells[(d.getDay() + 6) % 7][d.getHours()] += h;
      total += h;
      t = next;
    }
  }
  return { cells, total };
}
