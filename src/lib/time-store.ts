import {
  getWeekKey,
  addWeeks,
} from "@/lib/week-utils";
import { useEffect, useState } from "react";
import {
  CLOUD_UPDATED_EVENT,
  LOCAL_DATA_CHANGED_EVENT,
} from "@/lib/cloud-sync";

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

export function addWeeks(
  week: WeekKey,
  amount: number
): WeekKey {
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
  | "salud"
  | "trabajo"
  | "estudio"
  | "deporte"
  | "ocio"
  | "social"
  | "transporte"
  | "otro";

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
export type TaskPriority = "low" | "medium" | "high" | "urgent";

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
  // Reserved for future: parentId, rrule, remindAt, attachments, comments
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
  notes?: string;
  goalIds?: string[];
  /** "timer" (default, back-compat) or "manual" completion. */
  completion?: CompletionMode;
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

export const GOAL_ICONS = ["💪", "📚", "💼", "🎮", "🧘", "❤️", "🎯", "🏃", "🌱", "🎨", "🍽️", "😴", "👨‍👩‍👧", "✈️", "💰", "⭐"];

export function nextColor(existing: { color: string }[]): string {
  const used = new Set(existing.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export const weeklyHours = (a: Activity) => a.hoursPerDay * a.daysPerWeek;

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

export const DAY_NAMES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const goalProgress = (goal: Goal, activities: Activity[]) => {
  const linked = activities.filter((a) => a.goalIds?.includes(goal.id));
  const hours = linked.reduce((s, a) => s + weeklyHours(a), 0);
  const pct = goal.targetHours > 0 ? (hours / goal.targetHours) * 100 : 0;
  return { hours, linked, pct, remaining: Math.max(0, goal.targetHours - hours) };
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
  objectives: Objective[];
  tasks: Task[];

  selectedWeek: string;

  setSelectedWeek: (week: string) => void;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToCurrentWeek: () => void;
}


const seedGoals: Goal[] = [
  { id: "gs-salud", name: "Salud", color: PALETTE[1], icon: "💪", targetHours: 70, active: true, createdAt: Date.now() },
  { id: "gs-trabajo", name: "Trabajo", color: PALETTE[0], icon: "💼", targetHours: 40, active: true, createdAt: Date.now() },
  { id: "gs-ocio", name: "Ocio", color: PALETTE[2], icon: "🎮", targetHours: 12, active: true, createdAt: Date.now() },
];

const defaultStore: Store = {
  activities: [
    { id: "seed-1", name: "Dormir", hoursPerDay: 8, daysPerWeek: 7, color: PALETTE[0], category: "salud", permanent: true, goalIds: ["gs-salud"] },
    { id: "seed-2", name: "Trabajo", hoursPerDay: 8, daysPerWeek: 5, color: PALETTE[1], category: "trabajo", permanent: true, goalIds: ["gs-trabajo"] },
    { id: "seed-3", name: "Comer", hoursPerDay: 1.5, daysPerWeek: 7, color: PALETTE[2], category: "salud", permanent: true, goalIds: ["gs-salud"] },
    { id: "seed-4", name: "Gimnasio", hoursPerDay: 1, daysPerWeek: 4, color: PALETTE[3], category: "deporte", permanent: true, goalIds: ["gs-salud"] },
    { id: "seed-5", name: "Ocio", hoursPerDay: 2, daysPerWeek: 7, color: PALETTE[4], category: "ocio", goalIds: ["gs-ocio"] },
  ],
  goals: seedGoals,
  tasks: [],
  theme: "light",
  chartView: "activities",
};


function migrate(raw: any): Store {
  if (!raw || typeof raw !== "object") return defaultStore;
  const activities: Activity[] = Array.isArray(raw.activities) ? raw.activities : defaultStore.activities;
  let goals: Goal[] = [];
  if (Array.isArray(raw.goals)) {
    goals = raw.goals.map((g: any, i: number): Goal => {
      if (g && typeof g === "object" && "targetHours" in g) return g as Goal;
      const match = activities.find((a) => a.name.toLowerCase() === String(g?.activityName ?? "").toLowerCase());
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
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    theme: raw.theme === "dark" ? "dark" : "light",
    chartView: raw.chartView === "goals" || raw.chartView === "tasks" || raw.chartView === "combined"
      ? raw.chartView
      : "activities",
  };
}

function normalize(store: Store): Store {
  return {
    ...store,
    tasks: Array.isArray(store.tasks) ? store.tasks : [],
    activities: store.activities.map((a) => ({
      ...a,
      tasks: Array.isArray(a.tasks) ? a.tasks : [],
    })),
  };
}

export function useTimeStore() {
  const [store, setStore] = useState<Store>(defaultStore);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        setStore(normalize({ ...defaultStore, ...JSON.parse(raw) }));
      } else {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) setStore(normalize(migrate(JSON.parse(legacy))));
      }
    } catch {}
    setHydrated(true);
  }, []);

useEffect(() => {
  if (!hydrated) return;

  try {
    const value = JSON.stringify(store);

    localStorage.setItem(KEY, value);

    /*
     * Tell cloud-sync that the calendar was actually changed.
     */
    window.dispatchEvent(
      new CustomEvent(LOCAL_DATA_CHANGED_EVENT, {
        detail: { key: KEY },
      })
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
  useEffect(() => {
    if (!hydrated) return;

    const handleCloudUpdate = () => {
      try {
        const raw = localStorage.getItem(KEY);

        if (!raw) return;

        setStore(normalize({ ...defaultStore, ...JSON.parse(raw) }));
      } catch {
        /* Ignore malformed cloud data */
      }
    };

    window.addEventListener(CLOUD_UPDATED_EVENT, handleCloudUpdate);

    return () => {
      window.removeEventListener(
        CLOUD_UPDATED_EVENT,
        handleCloudUpdate
      );
    };
  }, [hydrated]);
  
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", store.theme === "dark");
  }, [store.theme, hydrated]);

  return { store, setStore, hydrated };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
