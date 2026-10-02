import { activityDays, DAY_NAMES, type Activity } from "@/lib/time-store";
import { addWeeks, getWeekKey, weekKeyToDate } from "@/lib/week-utils";

/* ------------------------------------------------------------------ *
 * Schedule conflict detection between activities.
 * An activity with a start time occupies [start, start + hoursPerDay) on
 * each of its days, every week if permanent or only in its own week
 * otherwise. Intervals may run past midnight into the next day (and from
 * Sunday into the next week's Monday). Touching ends are not a conflict.
 * ------------------------------------------------------------------ */

export type SchedulableActivity = Pick<
  Activity,
  | "id"
  | "name"
  | "startTime"
  | "hoursPerDay"
  | "dayIndices"
  | "daysPerWeek"
  | "permanent"
  | "weekStart"
>;

export interface ScheduleConflict {
  activityId: string;
  activityName: string;
  /** Day the overlap starts on (0 = Monday). */
  dayIndex: number;
  /** Minutes from that day's midnight. */
  startMin: number;
  endMin: number;
  /** The overlap runs past midnight into the following day. */
  endsNextDay: boolean;
  /** Monday of the week the overlap happens in, when it is limited to one week. */
  weekKey: string | null;
}

const DAY = 24 * 60;
const WEEK = 7 * DAY;

/** "HH:mm" → minutes after midnight, or null when unset or malformed. */
export function parseTime(value: string | undefined): number | null {
  const m = value ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export const formatTime = (minutes: number) => {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const durationMinutes = (a: SchedulableActivity) =>
  Math.round(Math.min(24, Math.max(0, a.hoursPerDay || 0)) * 60);

/** Monday of a non-permanent activity's week (legacy ones without it belong to the current week). */
const weekOf = (a: SchedulableActivity, now: Date) =>
  getWeekKey(a.weekStart ? weekKeyToDate(a.weekStart) : now);

const weeksBetween = (from: string, to: string) =>
  Math.round((weekKeyToDate(to).getTime() - weekKeyToDate(from).getTime()) / (WEEK * 60_000));

/** Occupied intervals, in minutes from the anchor week's Monday 00:00. */
function intervals(a: SchedulableActivity, weekOffsets: number[]): [number, number][] {
  const start = parseTime(a.startTime);
  const duration = durationMinutes(a);
  if (start === null || duration === 0) return [];
  const out: [number, number][] = [];
  for (const offset of weekOffsets) {
    for (const day of activityDays(a as Activity)) {
      const s = offset * WEEK + day * DAY + start;
      out.push([s, s + duration]);
    }
  }
  return out;
}

/**
 * Every overlap between `candidate` and `others` (the candidate itself, by id,
 * is skipped so editing an activity never conflicts with its saved version).
 */
export function findScheduleConflicts(
  candidate: SchedulableActivity,
  others: SchedulableActivity[],
  now: Date = new Date(),
): ScheduleConflict[] {
  if (intervals(candidate, [0]).length === 0) return [];

  const currentWeek = getWeekKey(now);
  const candidateWeek = candidate.permanent ? null : weekOf(candidate, now);
  const found = new Map<string, ScheduleConflict>();

  for (const other of others) {
    if (other.id === candidate.id) continue;

    // Place both on a timeline anchored at one Monday. A permanent activity is
    // laid out on the neighbouring weeks too, so overnight spills are caught.
    let anchor: string | null;
    let candidateWeeks: number[];
    let otherWeeks: number[];
    if (candidate.permanent && other.permanent) {
      anchor = null;
      candidateWeeks = [0];
      otherWeeks = [-1, 0, 1];
    } else if (candidate.permanent) {
      anchor = weekOf(other, now);
      if (anchor < currentWeek) continue;
      candidateWeeks = [-1, 0, 1];
      otherWeeks = [0];
    } else if (other.permanent) {
      anchor = candidateWeek!;
      candidateWeeks = [0];
      otherWeeks = [-1, 0, 1];
    } else {
      anchor = candidateWeek!;
      const diff = weeksBetween(anchor, weekOf(other, now));
      if (Math.abs(diff) > 1) continue;
      candidateWeeks = [0];
      otherWeeks = [diff];
    }

    const theirs = intervals(other, otherWeeks);
    for (const [a0, a1] of intervals(candidate, candidateWeeks)) {
      for (const [b0, b1] of theirs) {
        const lo = Math.max(a0, b0);
        const hi = Math.min(a1, b1);
        if (lo >= hi) continue;

        const weekIdx = Math.floor(lo / WEEK);
        const inWeek = lo - weekIdx * WEEK;
        const dayIndex = Math.floor(inWeek / DAY);
        const startMin = inWeek - dayIndex * DAY;
        const endMin = startMin + (hi - lo);
        const week = anchor === null ? null : addWeeks(anchor, weekIdx);

        const conflict: ScheduleConflict = {
          activityId: other.id,
          activityName: other.name,
          dayIndex,
          startMin,
          endMin,
          endsNextDay: endMin > DAY,
          weekKey: week !== null && week !== candidateWeek ? week : null,
        };
        found.set(`${other.id}|${week}|${dayIndex}|${startMin}|${endMin}`, conflict);
      }
    }
  }

  return [...found.values()].sort(
    (x, y) =>
      (x.weekKey ?? "").localeCompare(y.weekKey ?? "") ||
      x.dayIndex - y.dayIndex ||
      x.startMin - y.startMin ||
      x.activityName.localeCompare(y.activityName),
  );
}

const dayName = (i: number) => DAY_NAMES[((i % 7) + 7) % 7].toLowerCase();

/** "Gimnasio, el miércoles de 15:30 a 16:00" */
export function describeConflict(c: ScheduleConflict): string {
  const end = c.endsNextDay
    ? `${formatTime(c.endMin)} del ${dayName(c.dayIndex + 1)}`
    : formatTime(c.endMin);
  const week = c.weekKey
    ? ` (semana del ${weekKeyToDate(c.weekKey).toLocaleDateString("es-AR", { day: "numeric", month: "long" })})`
    : "";
  return `${c.activityName}, el ${dayName(c.dayIndex)} de ${formatTime(c.startMin)} a ${end}${week}`;
}
