import { CLOUD_UPDATED_EVENT, LOCAL_DATA_CHANGED_EVENT } from "@/lib/cloud-sync";
import { allTasks } from "@/lib/task-utils";
import type { Store } from "@/lib/time-store";
import { dateKeyOf, markActivityCompleted } from "@/lib/timer-store";

/* ------------------------------------------------------------------ *
 * Completing the tasks of an activity completes the activity.
 * When every task of an activity due today (or undated) is done — and
 * at least one was finished today — the activity is marked completed
 * for today. It only reacts to the moment the last task gets done, so
 * unmarking the activity by hand afterwards sticks.
 * ------------------------------------------------------------------ */

const STORE_KEY = "week168.v2";

function readStore(): Store | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? (JSON.parse(raw) as Store) : null;
    return s && Array.isArray(s.activities) ? s : null;
  } catch {
    return null;
  }
}

/** Activity ids whose tasks for `today` are all completed. */
export function activitiesWithTasksDone(store: Store, now = new Date()): Set<string> {
  const today = dateKeyOf(now);
  const byActivity = new Map<string, { total: number; done: number; doneToday: boolean }>();

  for (const t of allTasks(store)) {
    if (!t.activityId || t.archived) continue;
    if (t.dueDate && t.dueDate !== today) continue;
    const completed = t.status === "completed";
    // Undated tasks finished on another day don't belong to today's run.
    if (!t.dueDate && completed && t.completedAt && dateKeyOf(new Date(t.completedAt)) !== today) {
      continue;
    }
    const e = byActivity.get(t.activityId) ?? { total: 0, done: 0, doneToday: false };
    e.total++;
    if (completed) {
      e.done++;
      if (t.completedAt && dateKeyOf(new Date(t.completedAt)) === today) e.doneToday = true;
    }
    byActivity.set(t.activityId, e);
  }

  const out = new Set<string>();
  for (const [id, e] of byActivity) {
    if (e.total > 0 && e.done === e.total && e.doneToday) out.add(id);
  }
  return out;
}

let started = false;

export function startActivityAutoComplete() {
  if (started || typeof window === "undefined") return;
  started = true;

  let day = dateKeyOf();
  const initial = readStore();
  let prev = initial ? activitiesWithTasksDone(initial) : new Set<string>();

  const check = () => {
    const store = readStore();
    if (!store) return;
    const today = dateKeyOf();
    if (today !== day) {
      day = today;
      prev = new Set();
    }
    const done = activitiesWithTasksDone(store);
    for (const id of done) {
      if (!prev.has(id) && store.activities.some((a) => a.id === id)) {
        markActivityCompleted(id, today);
      }
    }
    prev = done;
  };

  window.addEventListener(LOCAL_DATA_CHANGED_EVENT, (e) => {
    const key = (e as CustomEvent<{ key?: string }>).detail?.key;
    if (!key || key === STORE_KEY) check();
  });
  window.addEventListener(CLOUD_UPDATED_EVENT, check);
}
