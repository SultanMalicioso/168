import { dateKeyOf, weekStart } from "@/lib/timer-store";

/* ------------------------------------------------------------------ *
 * What the progress calendar lets each plan do. No React here: the
 * component asks these rules and renders accordingly.
 *
 * - full (Pro, `calendar.history`): week, month and year views and free
 *   navigation, like before plans existed.
 * - limited (Free): week view of the current week only.
 * - pending: the plan isn't known yet, so nothing extra is enabled and no
 *   locks are shown (avoids a lock flashing for a Pro user).
 *
 * This only shapes the UI. History keeps being recorded for everyone.
 * ------------------------------------------------------------------ */

export type CalendarView = "week" | "month" | "year";
export type CalendarAccess = "pending" | "limited" | "full";
/** enabled: works · locked: shows a lock and offers Pro · disabled: inert. */
export type ControlState = "enabled" | "locked" | "disabled";

export interface CalendarState {
  view: CalendarView;
  cursor: Date;
}

export function calendarAccess(plan: { loading: boolean; allowed: boolean }): CalendarAccess {
  if (plan.loading) return "pending";
  return plan.allowed ? "full" : "limited";
}

/** First and last day (yyyy-mm-dd) of the Monday-to-Sunday week containing `d`. */
export function currentWeekKeys(d: Date): { from: string; to: string } {
  const start = weekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: dateKeyOf(start), to: dateKeyOf(end) };
}

const sameWeek = (a: Date, b: Date) => currentWeekKeys(a).from === currentWeekKeys(b).from;

export function viewControl(view: CalendarView, access: CalendarAccess): ControlState {
  if (view === "week" || access === "full") return "enabled";
  return access === "limited" ? "locked" : "disabled";
}

/** Going back opens the Pro dialog for Free users. */
export function backControl(access: CalendarAccess): ControlState {
  if (access === "full") return "enabled";
  return access === "limited" ? "locked" : "disabled";
}

/** Free users are always on the current week: there is nothing ahead to unlock. */
export function forwardControl(access: CalendarAccess): ControlState {
  return access === "full" ? "enabled" : "disabled";
}

/** Whether the detail of `dateKey` may be opened. */
export function canOpenDay(dateKey: string, access: CalendarAccess, now: Date): boolean {
  if (access === "full") return true;
  const { from, to } = currentWeekKeys(now);
  return dateKey >= from && dateKey <= to;
}

/**
 * Without full access the calendar shows the current week in the week
 * view (e.g. after going from Pro to Free while on a month or another
 * week). Returns `state` itself when nothing changes.
 */
export function normalizeCalendar(
  state: CalendarState,
  access: CalendarAccess,
  now: Date,
): CalendarState {
  if (access === "full") return state;
  if (state.view === "week" && sameWeek(state.cursor, now)) return state;
  return { view: "week", cursor: new Date(now) };
}
