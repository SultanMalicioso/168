import {
  Activity,
  Goal,
  Store,
  Task,
  TaskPriority,
  TASK_PRIORITY_META,
  uid,
} from "@/lib/time-store";

/** Merge top-level tasks + activity-inline tasks into a single flat list (skips deleted). */
export function allTasks(store: Store): Task[] {
  const out: Task[] = [];
  for (const t of store.tasks ?? []) {
    if (t.deletedAt) continue;
    out.push(t);
  }
  for (const a of store.activities) {
    for (const t of a.tasks ?? []) {
      if (t.deletedAt) continue;
      out.push({ ...t, activityId: a.id });
    }
  }
  return out;
}

/** Include trashed tasks. */
export function allTasksWithTrash(store: Store): Task[] {
  const out: Task[] = [];
  for (const t of store.tasks ?? []) out.push(t);
  for (const a of store.activities) {
    for (const t of a.tasks ?? []) out.push({ ...t, activityId: a.id });
  }
  return out;
}

export function todayISO(d = new Date()): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

/** Resolve a task's effective color: task → activity → goal → fallback. */
export function taskColor(t: Task, store: Store): string {
  if (t.color) return t.color;
  if (t.activityId) {
    const a = store.activities.find((x) => x.id === t.activityId);
    if (a) return a.color;
  }
  const gid = t.goalIds?.[0];
  if (gid) {
    const g = store.goals.find((x) => x.id === gid);
    if (g) return g.color;
  }
  return "var(--muted-foreground)";
}

export const DEFAULT_TASK_MINUTES = 30;
export const taskMinutes = (t: Task) =>
  Math.max(1, Math.round(t.estimatedMinutes ?? DEFAULT_TASK_MINUTES));

// ---------- Filters ----------

export function tasksToday(store: Store): Task[] {
  const iso = todayISO();
  return allTasks(store).filter((t) => t.dueDate === iso && !t.archived);
}
export function tasksOverdue(store: Store): Task[] {
  const iso = todayISO();
  return allTasks(store).filter(
    (t) =>
      !!t.dueDate &&
      t.dueDate < iso &&
      t.status !== "completed" &&
      !t.archived,
  );
}
export function tasksUpcoming(store: Store): Task[] {
  const iso = todayISO();
  return allTasks(store).filter(
    (t) => !!t.dueDate && t.dueDate > iso && !t.archived,
  );
}
export function tasksCompleted(store: Store): Task[] {
  return allTasks(store)
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
export function tasksUnassigned(store: Store): Task[] {
  return allTasks(store).filter((t) => !t.activityId && !t.archived);
}
export function tasksArchived(store: Store): Task[] {
  return allTasks(store).filter((t) => t.archived && !t.deletedAt);
}
export function tasksTrashed(store: Store): Task[] {
  return allTasksWithTrash(store).filter((t) => !!t.deletedAt);
}

// ---------- CRUD (returns a new store) ----------

export function createTask(store: Store, data: Partial<Task>): Store {
  const t: Task = {
    id: uid(),
    name: data.name?.trim() || "Nueva tarea",
    status: data.status ?? "pending",
    priority: data.priority ?? "medium",
    estimatedMinutes: Math.max(1, data.estimatedMinutes ?? DEFAULT_TASK_MINUTES),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...data,
  };
  // Sanity: strip stale refs
  if (t.activityId && !store.activities.some((a) => a.id === t.activityId)) {
    t.activityId = undefined;
  }
  if (t.goalIds) {
    t.goalIds = t.goalIds.filter((gid) => store.goals.some((g) => g.id === gid));
  }
  if (t.activityId) {
    return {
      ...store,
      activities: store.activities.map((a) =>
        a.id === t.activityId ? { ...a, tasks: [...(a.tasks ?? []), t] } : a,
      ),
    };
  }
  return { ...store, tasks: [...store.tasks, t] };
}

/** Locate the task and its parent context. */
function locate(
  store: Store,
  id: string,
):
  | { where: "top"; index: number }
  | { where: "activity"; activityId: string; index: number }
  | null {
  const top = store.tasks.findIndex((t) => t.id === id);
  if (top >= 0) return { where: "top", index: top };
  for (const a of store.activities) {
    const idx = (a.tasks ?? []).findIndex((t) => t.id === id);
    if (idx >= 0) return { where: "activity", activityId: a.id, index: idx };
  }
  return null;
}

export function updateTask(store: Store, id: string, patch: Partial<Task>): Store {
  const loc = locate(store, id);
  if (!loc) return store;

  const current: Task =
    loc.where === "top"
      ? store.tasks[loc.index]
      : (store.activities.find((a) => a.id === loc.activityId)!.tasks ?? [])[loc.index];

  const merged: Task = { ...current, ...patch, updatedAt: Date.now() };
  if (patch.status !== undefined) {
    merged.completedAt = patch.status === "completed" ? Date.now() : undefined;
  }
  if (merged.estimatedMinutes !== undefined) {
    merged.estimatedMinutes = Math.max(1, Math.round(merged.estimatedMinutes));
  }
  // Validate refs
  if (merged.activityId && !store.activities.some((a) => a.id === merged.activityId)) {
    merged.activityId = undefined;
  }
  if (merged.goalIds) {
    merged.goalIds = merged.goalIds.filter((gid) => store.goals.some((g) => g.id === gid));
  }

  const targetActivityId = merged.activityId;
  const source = loc.where === "top" ? undefined : loc.activityId;

  // Case A: stays in same place
  if (source === targetActivityId) {
    if (loc.where === "top") {
      const tasks = [...store.tasks];
      tasks[loc.index] = merged;
      return { ...store, tasks };
    }
    return {
      ...store,
      activities: store.activities.map((a) => {
        if (a.id !== loc.activityId) return a;
        const arr = [...(a.tasks ?? [])];
        arr[loc.index] = merged;
        return { ...a, tasks: arr };
      }),
    };
  }

  // Case B: moved between containers → remove from source, add to target
  let activities = store.activities;
  let tasks = store.tasks;
  if (loc.where === "top") {
    tasks = tasks.filter((_, i) => i !== loc.index);
  } else {
    activities = activities.map((a) =>
      a.id === loc.activityId
        ? { ...a, tasks: (a.tasks ?? []).filter((_, i) => i !== loc.index) }
        : a,
    );
  }
  if (targetActivityId) {
    activities = activities.map((a) =>
      a.id === targetActivityId ? { ...a, tasks: [...(a.tasks ?? []), merged] } : a,
    );
  } else {
    tasks = [...tasks, merged];
  }
  return { ...store, activities, tasks };
}

/** Soft delete → papelera. */
export function trashTask(store: Store, id: string): Store {
  return updateTask(store, id, { deletedAt: Date.now() });
}
export function restoreTask(store: Store, id: string): Store {
  return updateTask(store, id, { deletedAt: undefined });
}
/** Hard delete (permanent). */
export function purgeTask(store: Store, id: string): Store {
  return {
    ...store,
    tasks: store.tasks.filter((t) => t.id !== id),
    activities: store.activities.map((a) => ({
      ...a,
      tasks: (a.tasks ?? []).filter((t) => t.id !== id),
    })),
  };
}
export function purgeAllTrashed(store: Store): Store {
  return {
    ...store,
    tasks: store.tasks.filter((t) => !t.deletedAt),
    activities: store.activities.map((a) => ({
      ...a,
      tasks: (a.tasks ?? []).filter((t) => !t.deletedAt),
    })),
  };
}

export function duplicateTask(store: Store, id: string): Store {
  const all = allTasksWithTrash(store);
  const src = all.find((t) => t.id === id);
  if (!src) return store;
  const copy: Partial<Task> = {
    ...src,
    id: undefined,
    name: `${src.name} (copia)`,
    status: "pending",
    completedAt: undefined,
    deletedAt: undefined,
    createdAt: Date.now(),
  };
  return createTask(store, copy);
}

// ---------- Stats ----------

export function taskStats(tasks: Task[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "completed").length;
  const inProg = tasks.filter((t) => t.status === "in_progress").length;
  const pending = total - done - inProg;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const plannedMin = tasks.reduce((s, t) => s + taskMinutes(t), 0);
  const doneMin = tasks
    .filter((t) => t.status === "completed")
    .reduce((s, t) => s + taskMinutes(t), 0);
  return { total, done, inProg, pending, pct, plannedMin, doneMin };
}

/** Consecutive days ending today with ≥1 completed task. */
export function dailyStreak(tasks: Task[]): number {
  const days = new Set(
    tasks
      .filter((t) => t.status === "completed" && t.completedAt)
      .map((t) => todayISO(new Date(t.completedAt!))),
  );
  let n = 0;
  const d = new Date();
  while (days.has(todayISO(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function weeklyStreak(tasks: Task[]): number {
  // consecutive ISO-weeks ending this week with ≥1 completed task
  const weeks = new Set(
    tasks
      .filter((t) => t.status === "completed" && t.completedAt)
      .map((t) => weekKey(new Date(t.completedAt!))),
  );
  let n = 0;
  const d = new Date();
  while (weeks.has(weekKey(d))) {
    n++;
    d.setDate(d.getDate() - 7);
  }
  return n;
}
function weekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

// ---------- Sorting / grouping ----------

export function sortTasks(tasks: Task[], by: "priority" | "date" | "duration" | "name" | "created") {
  const arr = [...tasks];
  switch (by) {
    case "priority":
      return arr.sort(
        (a, b) =>
          (TASK_PRIORITY_META[b.priority].weight - TASK_PRIORITY_META[a.priority].weight) ||
          (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
          a.name.localeCompare(b.name),
      );
    case "date":
      return arr.sort(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99"),
      );
    case "duration":
      return arr.sort((a, b) => taskMinutes(b) - taskMinutes(a));
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "created":
      return arr.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export function groupByPriority(tasks: Task[]) {
  const buckets: Record<TaskPriority, Task[]> = {
    urgent: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const t of tasks) buckets[t.priority].push(t);
  return buckets;
}

export function groupByGoal(tasks: Task[], goals: Goal[]) {
  const buckets = new Map<string, { goal: Goal | null; tasks: Task[] }>();
  buckets.set("__none__", { goal: null, tasks: [] });
  for (const g of goals) buckets.set(g.id, { goal: g, tasks: [] });
  for (const t of tasks) {
    const gid = t.goalIds?.[0];
    if (gid && buckets.has(gid)) buckets.get(gid)!.tasks.push(t);
    else buckets.get("__none__")!.tasks.push(t);
  }
  return Array.from(buckets.values()).filter((b) => b.tasks.length > 0);
}

export function groupByActivity(tasks: Task[], activities: Activity[]) {
  const buckets = new Map<string, { activity: Activity | null; tasks: Task[] }>();
  buckets.set("__none__", { activity: null, tasks: [] });
  for (const a of activities) buckets.set(a.id, { activity: a, tasks: [] });
  for (const t of tasks) {
    if (t.activityId && buckets.has(t.activityId)) buckets.get(t.activityId)!.tasks.push(t);
    else buckets.get("__none__")!.tasks.push(t);
  }
  return Array.from(buckets.values()).filter((b) => b.tasks.length > 0);
}

// ---------- Week helpers / extra views ----------

export function mondayOf(ref = new Date()): Date {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekDays(ref = new Date()): string[] {
  const m = mondayOf(ref);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(m);
    d.setDate(m.getDate() + i);
    return todayISO(d);
  });
}

/** Tasks scheduled inside the current week (optionally including undated ones). */
export function tasksInWeek(store: Store, includeUndated = true, ref = new Date()): Task[] {
  const days = new Set(weekDays(ref));
  return allTasks(store).filter(
    (t) => !t.archived && (t.dueDate ? days.has(t.dueDate) : includeUndated),
  );
}

/** Tasks for a specific ISO day. */
export function tasksOnDate(store: Store, iso: string): Task[] {
  return allTasks(store).filter((t) => !t.archived && t.dueDate === iso);
}

export function tasksNoDate(store: Store): Task[] {
  return allTasks(store).filter((t) => !t.dueDate && !t.archived && t.status !== "completed");
}

export function allTags(store: Store): string[] {
  const s = new Set<string>();
  for (const t of allTasks(store)) for (const tag of t.tags ?? []) s.add(tag);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

/** Apply a patch to many tasks at once. */
export function updateManyTasks(store: Store, ids: string[], patch: Partial<Task>): Store {
  return ids.reduce((acc, id) => updateTask(acc, id, patch), store);
}

export function trashManyTasks(store: Store, ids: string[]): Store {
  return ids.reduce((acc, id) => trashTask(acc, id), store);
}

export function shiftISO(iso: string | undefined, days: number): string {
  const base = iso ? new Date(`${iso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return todayISO(base);
}

export function groupByDate(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = t.dueDate ?? "__none__";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === "__none__" ? 1 : b === "__none__" ? -1 : a.localeCompare(b)))
    .map(([date, arr]) => ({ date, tasks: arr }));
}

/** Friendly relative date label. */
export function dateLabel(iso?: string): string {
  if (!iso) return "Sin fecha";
  const today = todayISO();
  if (iso === today) return "Hoy";
  if (iso === shiftISO(today, 1)) return "Mañana";
  if (iso === shiftISO(today, -1)) return "Ayer";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

export function fmtMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}
