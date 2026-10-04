import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { rollRecurring } from "@/lib/recurrence";
import { merge3 } from "@/lib/sync-merge";
import { CLOUD_UPDATED_EVENT, LOCAL_DATA_CHANGED_EVENT } from "@/lib/cloud-sync";

export type WeekKey = string;

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  return d;
}

export function getWeekKey(date: Date = new Date()): WeekKey {
  const monday = startOfWeek(date);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addWeeks(week: WeekKey, amount: number): WeekKey {
  const date = new Date(`${week}T12:00:00`);

  date.setDate(date.getDate() + amount * 7);

  return getWeekKey(date);
}

export function getWeekDates(week: WeekKey): Date[] {
  const monday = new Date(`${week}T12:00:00`);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function formatWeekRange(week: WeekKey): string {
  const dates = getWeekDates(week);

  const start = dates[0];
  const end = dates[6];

  const startText = start.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });

  const endText = end.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${startText} – ${endText}`;
}

const initialState = {
  activities: [],
  objectives: [],
  tasks: [],
  selectedWeek: getWeekKey(),
};

export type Category =
  "salud" | "trabajo" | "estudio" | "deporte" | "ocio" | "social" | "transporte" | "otro";

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "salud", label: "Salud", color: "var(--chart-2)" },
  { id: "trabajo", label: "Trabajo", color: "var(--chart-1)" },
  { id: "estudio", label: "Estudio", color: "var(--chart-5)" },
  { id: "deporte", label: "Deporte", color: "var(--chart-4)" },
  { id: "ocio", label: "Ocio", color: "var(--chart-3)" },
  { id: "social", label: "Social", color: "var(--chart-7)" },
  { id: "transporte", label: "Transporte", color: "var(--chart-6)" },
  { id: "otro", label: "Otro", color: "var(--chart-8)" },
];

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskRepeat = "daily" | "weekdays" | "weekly" | "monthly";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Subtask {
  id: string;
  name: string;
  done: boolean;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Optional activity link. Undefined = independent / standalone task. */
  activityId?: string;
  /** Optional goal links. */
  goalIds?: string[];
  category?: Category;
  dueDate?: string; // yyyy-mm-dd
  startTime?: string; // HH:mm
  dueTime?: string; // HH:mm
  /** Estimated duration in minutes. Drives donut segments in task mode. */
  estimatedMinutes?: number;
  color?: string;
  notes?: string;
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
  /** Soft-delete (papelera). */
  deletedAt?: number;
  archived?: boolean;
  /** Checklist of steps inside the task. */
  subtasks?: Subtask[];
  /** Repeat rule: completing the task creates its next occurrence. */
  repeat?: TaskRepeat;
  /** Shared by every occurrence of a repeating task. */
  seriesId?: string;
  /** This occurrence already created the next one. */
  repeatDone?: boolean;
  // Reserved for future: rrule, remindAt, attachments, comments
}

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; weight: number }
> = {
  low: { label: "Baja", color: "oklch(0.72 0.05 250)", weight: 0 },
  medium: { label: "Media", color: "oklch(0.75 0.14 85)", weight: 1 },
  high: { label: "Alta", color: "oklch(0.68 0.18 45)", weight: 2 },
  urgent: { label: "Urgente", color: "oklch(0.62 0.22 25)", weight: 3 },
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "oklch(0.72 0.02 250)" },
  in_progress: { label: "En progreso", color: "oklch(0.72 0.15 85)" },
  completed: { label: "Completada", color: "oklch(0.7 0.16 155)" },
};

/** How an activity gets marked as done. Legacy activities default to "timer". */
export type CompletionMode = "timer" | "manual";

export interface Activity {
  id: string;
  name: string;
  hoursPerDay: number;
  daysPerWeek: number;
  dayIndices?: number[];
  color: string;
  category: Category;
  permanent?: boolean;
  weekStart?: string;
  /** Epoch ms; absent on activities created before it was tracked. */
  createdAt?: number;
  notes?: string;
  goalIds?: string[];
  /** "timer" (default, back-compat) or "manual" completion. */
  completion?: CompletionMode;
  /** Optional daily start time (HH:mm). Drives notifications. */
  startTime?: string;
  /** Per-day start times (key "0" = Monday … "6" = Sunday) overriding startTime. */
  dayStartTimes?: Record<string, string>;
  /** Minutes of anticipation for the reminder. undefined = global default. */
  reminderMinutes?: number;
  /** Legacy inline tasks — still supported for backward compatibility. */
  tasks?: Task[];
}

/** Migration-safe accessor: activities without the field keep the timer. */
export const completionMode = (a: Activity): CompletionMode =>
  a.completion === "manual" ? "manual" : "timer";
export const usesTimer = (a: Activity) => completionMode(a) === "timer";
export const completionIcon = (a: Activity) => (usesTimer(a) ? "⏱" : "✅");

export interface Goal {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  targetHours: number;
  active: boolean;
  createdAt: number;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export const GOAL_ICONS = [
  "💪",
  "📚",
  "💼",
  "🎮",
  "🧘",
  "❤️",
  "🎯",
  "🏃",
  "🌱",
  "🎨",
  "🍽️",
  "😴",
  "👨‍👩‍👧",
  "✈️",
  "💰",
  "⭐",
];

export function nextColor(existing: { color: string }[]): string {
  const used = new Set(existing.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export const weeklyHours = (a: Activity) => a.hoursPerDay * a.daysPerWeek;

/** Human duration from hours: "10 min", "2 h", "1 h 30 min". */
export function formatDuration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Start time of an activity on a given day (0 = Monday): its own or the general one. */
export const startTimeOn = (
  a: Pick<Activity, "startTime" | "dayStartTimes">,
  day: number,
): string | undefined => a.dayStartTimes?.[String(day)] || a.startTime || undefined;

export function activityDays(a: Activity): Set<number> {
  const days = new Set<number>();
  if (a.dayIndices && a.dayIndices.length > 0) {
    for (const d of a.dayIndices) {
      if (d >= 0 && d < 7) days.add(d);
    }
    return days;
  }
  const n = Math.max(0, Math.min(7, a.daysPerWeek));
  for (let i = 0; i < n; i++) days.add(i);
  return days;
}

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * A goal's progress over one week: `activities` are that week's activities and
 * `realHours` gives the hours actually done in that week (timer or manual check).
 */
export const goalProgress = (
  goal: Goal,
  activities: Activity[],
  realHours: (a: Activity) => number,
) => {
  const linked = activities.filter((a) => a.goalIds?.includes(goal.id));
  const planned = linked.reduce((s, a) => s + weeklyHours(a), 0);
  const done = linked.reduce((s, a) => s + realHours(a), 0);
  const pct = goal.targetHours > 0 ? (done / goal.targetHours) * 100 : 0;
  return {
    linked,
    planned,
    done,
    pct,
    remaining: Math.max(0, goal.targetHours - done),
    /** Done minus planned: negative when behind the plan. */
    diff: done - planned,
  };
};

export type ProgressState = "exceeded" | "completed" | "near" | "behind" | "empty";
export function progressState(pct: number): ProgressState {
  if (pct <= 0) return "empty";
  if (pct > 105) return "exceeded";
  if (pct >= 95) return "completed";
  if (pct >= 60) return "near";
  return "behind";
}
export const PROGRESS_COLORS: Record<ProgressState, string> = {
  empty: "oklch(0.7 0 0)",
  behind: "oklch(0.65 0.22 25)",
  near: "oklch(0.78 0.16 85)",
  completed: "oklch(0.7 0.16 155)",
  exceeded: "oklch(0.65 0.18 250)",
};
export const PROGRESS_LABEL: Record<ProgressState, string> = {
  empty: "Sin registro",
  behind: "Atrasado",
  near: "Cerca",
  completed: "Alcanzado",
  exceeded: "Superado",
};

// Task helpers (legacy — used by ActivityForm/TaskList)
export const taskProgress = (a: Activity) => {
  const tasks = a.tasks ?? [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  return { total, completed, inProgress, pending, pct };
};

const KEY = "week168.v2";
const LEGACY_KEY = "week168.v1";

export type ChartView = "activities" | "goals" | "tasks" | "combined";

export interface TimeStore {
  activities: Activity[];
  goals: Goal[];
  tasks: Task[];

  selectedWeek: string;

  setSelectedWeek: (week: string) => void;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToCurrentWeek: () => void;
}

const seedGoals: Goal[] = [
  {
    id: "gs-salud",
    name: "Salud",
    color: PALETTE[1],
    icon: "💪",
    targetHours: 70,
    active: true,
    createdAt: Date.now(),
  },
  {
    id: "gs-trabajo",
    name: "Trabajo",
    color: PALETTE[0],
    icon: "💼",
    targetHours: 40,
    active: true,
    createdAt: Date.now(),
  },
  {
    id: "gs-ocio",
    name: "Ocio",
    color: PALETTE[2],
    icon: "🎮",
    targetHours: 12,
    active: true,
    createdAt: Date.now(),
  },
];

export interface Store {
  activities: Activity[];
  goals: Goal[];
  tasks: Task[];
  theme: "light" | "dark";
  chartView: ChartView;
  selectedWeek: string;
}

const defaultStore: Store = {
  activities: [
    {
      id: "seed-1",
      name: "Dormir",
      hoursPerDay: 8,
      daysPerWeek: 7,
      color: PALETTE[0],
      category: "salud",
      permanent: true,
      goalIds: ["gs-salud"],
    },
    {
      id: "seed-2",
      name: "Trabajo",
      hoursPerDay: 8,
      daysPerWeek: 5,
      color: PALETTE[1],
      category: "trabajo",
      permanent: true,
      goalIds: ["gs-trabajo"],
    },
    {
      id: "seed-3",
      name: "Comer",
      hoursPerDay: 1.5,
      daysPerWeek: 7,
      color: PALETTE[2],
      category: "salud",
      permanent: true,
      goalIds: ["gs-salud"],
    },
    {
      id: "seed-4",
      name: "Gimnasio",
      hoursPerDay: 1,
      daysPerWeek: 4,
      color: PALETTE[3],
      category: "deporte",
      permanent: true,
      goalIds: ["gs-salud"],
    },
    {
      id: "seed-5",
      name: "Ocio",
      hoursPerDay: 2,
      daysPerWeek: 7,
      color: PALETTE[4],
      category: "ocio",
      goalIds: ["gs-ocio"],
    },
  ],
  goals: seedGoals,
  tasks: [],
  theme: "light",
  chartView: "activities",
  selectedWeek: getWeekKey(),
};

/** Goals as saved by the first builds: one per activity, by name. */
interface LegacyGoal {
  id?: string;
  activityName?: string;
  minHours?: number;
}

function migrate(input: unknown): Store {
  if (!input || typeof input !== "object") return defaultStore;
  const raw = input as Partial<Record<keyof Store, unknown>>;
  const activities: Activity[] = Array.isArray(raw.activities)
    ? (raw.activities as Activity[])
    : defaultStore.activities;
  let goals: Goal[] = [];
  if (Array.isArray(raw.goals)) {
    goals = (raw.goals as (Goal | LegacyGoal | null)[]).map((item, i): Goal => {
      if (item && typeof item === "object" && "targetHours" in item) return item as Goal;
      const g = item as LegacyGoal | null;
      const match = activities.find(
        (a) => a.name.toLowerCase() === String(g?.activityName ?? "").toLowerCase(),
      );
      const id = g?.id ?? Math.random().toString(36).slice(2, 10);
      const color = match?.color ?? PALETTE[i % PALETTE.length];
      if (match) {
        match.goalIds = Array.from(new Set([...(match.goalIds ?? []), id]));
      }
      return {
        id,
        name: g?.activityName ?? "Objetivo",
        color,
        targetHours: g?.minHours ?? 10,
        active: true,
        createdAt: Date.now(),
      };
    });
  }
  return {
    activities,
    goals,
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as Task[]) : [],
    theme: raw.theme === "dark" ? "dark" : "light",
    chartView:
      raw.chartView === "goals" || raw.chartView === "tasks" || raw.chartView === "combined"
        ? raw.chartView
        : "activities",
    selectedWeek: typeof raw.selectedWeek === "string" ? raw.selectedWeek : getWeekKey(),
  };
}

/**
 * Older builds saved tasks created from the editor with an empty id (""),
 * so several tasks shared one id and actions hit the wrong task. Give every
 * task without a unique id a fresh one.
 */
function repairTaskIds(store: Store): Store {
  const seen = new Set<string>();
  let changed = false;
  const fix = (tasks: Task[]) =>
    tasks.map((t) => {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        return t;
      }
      changed = true;
      let id = uid();
      while (seen.has(id)) id = uid();
      seen.add(id);
      return { ...t, id };
    });
  const tasks = fix(store.tasks);
  const activities = store.activities.map((a) => ({ ...a, tasks: fix(a.tasks ?? []) }));
  return changed ? { ...store, tasks, activities } : store;
}

/** Any date of a week → that week's Monday key (older builds stored any picked day). */
export function mondayKeyOf(value: string | undefined): string {
  if (!value) return getWeekKey();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? getWeekKey() : getWeekKey(d);
}

/** The viewed week is per device and per visit: it always opens on the current week. */
function normalize(store: Store): Store {
  return rollRecurring(
    repairTaskIds({
      ...store,
      selectedWeek: getWeekKey(),
      tasks: Array.isArray(store.tasks) ? store.tasks : [],
      activities: Array.isArray(store.activities)
        ? store.activities.map((a) => ({
            ...a,
            weekStart: mondayKeyOf(a.weekStart),
            tasks: Array.isArray(a.tasks) ? a.tasks : [],
          }))
        : [],
    }),
  );
}

/** What gets stored and synced: everything except the device's viewed week. */
function persistable(store: Store): string {
  const { selectedWeek: _viewOnly, ...data } = store;
  void _viewOnly;
  return JSON.stringify(data);
}

export function useTimeStore() {
  const [store, setStore] = useState<Store>(defaultStore);
  const [hydrated, setHydrated] = useState(false);

  /* Every change goes through rollRecurring, so completing a repeating
     task anywhere in the app creates its next occurrence. */
  const setStoreRolled = useCallback(
    (update: SetStateAction<Store>) =>
      setStore((s) => rollRecurring(typeof update === "function" ? update(s) : update)),
    [],
  );

  /* Expired completed/trashed tasks must go even if the app stays open untouched. */
  useEffect(() => {
    const id = window.setInterval(() => setStoreRolled((s) => s), 10 * 60_000);
    return () => window.clearInterval(id);
  }, [setStoreRolled]);

  /* Last value written to storage, without view-only fields. */
  const savedRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    try {
      if (raw) {
        setStore(normalize({ ...defaultStore, ...JSON.parse(raw) }));
        savedRef.current = raw;
      } else {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) setStore(normalize(migrate(JSON.parse(legacy))));
        /* Nothing stored: demo data stays unsaved until the user changes something. */
        savedRef.current = persistable(defaultStore);
      }
    } catch {
      /* Unreadable data: keep a copy and let the cloud copy win on the next sync. */
      try {
        if (raw) localStorage.setItem(`${KEY}.backup-${Date.now()}`, raw);
        localStorage.removeItem("week168.sync.meta");
      } catch {
        /* storage unavailable */
      }
      savedRef.current = persistable(defaultStore);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      let value = persistable(store);
      /* Unchanged data (a reload echo, or only the viewed week changed): nothing to save. */
      if (value === savedRef.current) return;

      /* Storage changed behind our back (cloud or another tab): merge, never overwrite. */
      const onDisk = localStorage.getItem(KEY);
      if (onDisk != null && savedRef.current != null && onDisk !== savedRef.current) {
        try {
          const merged = merge3(
            JSON.parse(savedRef.current),
            JSON.parse(value),
            JSON.parse(onDisk),
          );
          value = JSON.stringify(merged);
          const next = normalize({ ...defaultStore, ...(merged as Partial<Store>) });
          setStore((current) => ({ ...next, selectedWeek: current.selectedWeek }));
        } catch {
          /* Malformed data on disk: keep ours */
        }
      }
      savedRef.current = value;

      localStorage.setItem(KEY, value);

      /*
       * Tell cloud-sync that the calendar was actually changed.
       */
      window.dispatchEvent(
        new CustomEvent(LOCAL_DATA_CHANGED_EVENT, {
          detail: { key: KEY },
        }),
      );
    } catch {
      /* Ignore localStorage errors */
    }
  }, [store, hydrated]);
  /*
   * When cloud-sync downloads a newer version from Supabase,
   * reload the calendar from localStorage so the React state
   * changes too.
   */
  /* Registered on mount, before cloud-sync starts, so no cloud update is missed. */
  useEffect(() => {
    const handleCloudUpdate = () => {
      try {
        const raw = localStorage.getItem(KEY);

        if (!raw) return;

        savedRef.current = raw;
        setStore((current) => ({
          ...normalize({ ...defaultStore, ...JSON.parse(raw) }),
          selectedWeek: current.selectedWeek,
        }));
      } catch {
        /* Ignore malformed cloud data */
      }
    };

    /* Another tab of this browser saved: adopt it instead of overwriting it later. */
    const handleStorage = (e: StorageEvent) => {
      if (e.key === KEY) handleCloudUpdate();
    };

    window.addEventListener(CLOUD_UPDATED_EVENT, handleCloudUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CLOUD_UPDATED_EVENT, handleCloudUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.classList.toggle("dark", store.theme === "dark");
  }, [store.theme, hydrated]);

  // Cambio automático de semana
  useEffect(() => {
    if (!hydrated) return;

    let lastCurrentWeek = getWeekKey();

    const checkWeekChange = () => {
      const currentWeek = getWeekKey();

      if (currentWeek === lastCurrentWeek) return;

      setStore((current) => {
        if (current.selectedWeek === lastCurrentWeek) {
          return {
            ...current,
            selectedWeek: currentWeek,
          };
        }

        return current;
      });

      lastCurrentWeek = currentWeek;
    };

    // Comprobar al cargar la aplicación
    checkWeekChange();

    // Comprobar periódicamente mientras está abierta
    const interval = window.setInterval(checkWeekChange, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [hydrated]);

  const goToPreviousWeek = () => {
    setStore((current) => ({
      ...current,
      selectedWeek: addWeeks(current.selectedWeek, -1),
    }));
  };

  const goToNextWeek = () => {
    setStore((current) => ({
      ...current,
      selectedWeek: addWeeks(current.selectedWeek, 1),
    }));
  };

  const goToCurrentWeek = () => {
    setStore((current) => ({
      ...current,
      selectedWeek: getWeekKey(),
    }));
  };

  return {
    store,
    setStore: setStoreRolled,
    hydrated,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
