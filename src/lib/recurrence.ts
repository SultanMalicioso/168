import type { Store, Task, TaskRepeat } from "@/lib/time-store";

/* ------------------------------------------------------------------ *
 * Repeating tasks.
 * Completing a repeating task creates its next occurrence (same task,
 * pending, subtasks unchecked, next date). The next one gets a
 * deterministic id (series + date), so two devices — or a re-run —
 * can never create it twice.
 * ------------------------------------------------------------------ */

export const REPEAT_OPTIONS: { value: TaskRepeat | "none"; label: string }[] = [
  { value: "none", label: "No se repite" },
  { value: "daily", label: "Todos los días" },
  { value: "weekdays", label: "De lunes a viernes" },
  { value: "weekly", label: "Cada semana" },
  { value: "monthly", label: "Cada mes" },
];

export const repeatLabel = (r?: TaskRepeat) =>
  REPEAT_OPTIONS.find((o) => o.value === r)?.label ?? "";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/** The date after `from` (yyyy-mm-dd) for the given rule. */
export function nextRepeatDate(from: string, repeat: TaskRepeat, anchorDay?: number): string {
  const d = parse(from);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "weekdays") {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else {
    // Monthly: keep the original day, clamped to short months (31 → 30/28).
    const day = anchorDay ?? d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, last));
    return iso(target);
  }
  return iso(d);
}

/**
 * Next occurrence of a series after `base` (its due date). It must fall
 * strictly after the day the task was completed, so finishing an overdue
 * task never brings it straight back for that same day, and never before
 * `today`, so a completion processed late doesn't create past-due copies.
 * Completing a task ahead of time still keeps the series' rhythm: the next
 * one is the occurrence after its due date.
 */
export function nextOccurrence(
  base: string,
  repeat: TaskRepeat,
  completedOn: string,
  today: string,
): string {
  const anchor = parse(base).getDate();
  let next = nextRepeatDate(base, repeat, anchor);
  for (let i = 0; (next <= completedOn || next < today) && i < 1000; i++)
    next = nextRepeatDate(next, repeat, anchor);
  return next;
}

/** Creates the next occurrence of every completed repeating task (idempotent). */
/** Completed tasks and trashed tasks are deleted for good after these delays. */
export const COMPLETED_TTL_MS = 24 * 60 * 60_000;
export const TRASH_TTL_MS = 12 * 60 * 60_000;

export function rollRecurring(store: Store, now = new Date()): Store {
  const today = iso(now);
  const ids = new Set<string>();
  for (const t of store.tasks ?? []) ids.add(t.id);
  for (const a of store.activities ?? []) for (const t of a.tasks ?? []) ids.add(t.id);

  let changed = false;

  const roll = (list: Task[]): Task[] => {
    const out: Task[] = [];
    for (const t of list) {
      if (!t.repeat || t.repeatDone || t.status !== "completed" || t.deletedAt) {
        out.push(t);
        continue;
      }
      changed = true;
      const done = t.completedAt ? new Date(t.completedAt) : now;
      const base = t.dueDate ?? iso(done);
      const due = nextOccurrence(base, t.repeat, iso(done), today);
      const seriesId = t.seriesId ?? t.id;
      const id = `${seriesId}~${due}`;

      out.push({ ...t, seriesId, repeatDone: true });
      if (ids.has(id)) continue;
      ids.add(id);
      out.push({
        ...t,
        id,
        seriesId,
        dueDate: due,
        status: "pending",
        completedAt: undefined,
        repeatDone: undefined,
        archived: undefined,
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        subtasks: t.subtasks?.map((st) => ({ ...st, done: false })),
      });
    }
    return out;
  };

  const nowMs = now.getTime();
  const expired = (t: Task) =>
    (t.deletedAt != null && nowMs - t.deletedAt >= TRASH_TTL_MS) ||
    (t.status === "completed" &&
      !t.deletedAt &&
      nowMs - (t.completedAt ?? t.updatedAt ?? t.createdAt) >= COMPLETED_TTL_MS);
  const process = (list: Task[]) => {
    const rolled = roll(list);
    const kept = rolled.filter((t) => !expired(t));
    if (kept.length !== rolled.length) changed = true;
    return kept;
  };

  const tasks = process(store.tasks ?? []);
  const activities = (store.activities ?? []).map((a) =>
    a.tasks?.length ? { ...a, tasks: process(a.tasks) } : a,
  );
  return changed ? { ...store, tasks, activities } : store;
}
