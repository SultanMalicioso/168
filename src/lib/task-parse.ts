import type { Activity, Goal, Task, TaskPriority } from "@/lib/time-store";
import { todayISO } from "@/lib/task-utils";

export interface ParsedTask {
  name: string;
  priority?: TaskPriority;
  estimatedMinutes?: number;
  dueDate?: string;
  dueTime?: string;
  activityId?: string;
  goalIds?: string[];
  tags?: string[];
}

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  urgente: "urgent",
  urgent: "urgent",
  "1": "urgent",
  alta: "high",
  high: "high",
  "2": "high",
  media: "medium",
  medium: "medium",
  "3": "medium",
  baja: "low",
  low: "low",
  "4": "low",
};

const DAY_TOKENS: Record<string, number> = {
  lun: 1,
  lunes: 1,
  mar: 2,
  martes: 2,
  mie: 3,
  mié: 3,
  miercoles: 3,
  miércoles: 3,
  jue: 4,
  jueves: 4,
  vie: 5,
  viernes: 5,
  sab: 6,
  sáb: 6,
  sabado: 6,
  sábado: 6,
  dom: 0,
  domingo: 0,
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function isoFrom(d: Date) {
  return todayISO(d);
}

function nextWeekday(target: number): string {
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return isoFrom(d);
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoFrom(d);
}

/**
 * Natural-language quick add:
 *  "Estudiar bio #Estudio @Salud !alta ~90m mañana 18:00 +examen"
 */
export function parseQuickTask(
  input: string,
  activities: Activity[],
  goals: Goal[],
): ParsedTask {
  const out: ParsedTask = { name: "", tags: [], goalIds: [] };
  const words = input.split(/\s+/).filter(Boolean);
  const rest: string[] = [];

  for (const raw of words) {
    const w = raw.trim();
    const low = norm(w);

    // priority
    if (w.startsWith("!")) {
      const p = PRIORITY_WORDS[norm(w.slice(1))];
      if (p) {
        out.priority = p;
        continue;
      }
    }
    // duration ~90m / ~2h / ~1.5h / ~45
    if (w.startsWith("~")) {
      const m = /^~(\d+(?:[.,]\d+)?)(h|hs|hr|m|min)?$/i.exec(low);
      if (m) {
        const n = parseFloat(m[1].replace(",", "."));
        const unit = m[2] ?? "m";
        out.estimatedMinutes = Math.max(
          1,
          Math.round(unit.startsWith("h") ? n * 60 : n),
        );
        continue;
      }
    }
    // activity
    if (w.startsWith("#") && w.length > 1) {
      const q = norm(w.slice(1));
      const a =
        activities.find((x) => norm(x.name) === q) ??
        activities.find((x) => norm(x.name).startsWith(q));
      if (a) {
        out.activityId = a.id;
        continue;
      }
    }
    // goal
    if (w.startsWith("@") && w.length > 1) {
      const q = norm(w.slice(1));
      const g =
        goals.find((x) => norm(x.name) === q) ??
        goals.find((x) => norm(x.name).startsWith(q));
      if (g) {
        out.goalIds = Array.from(new Set([...(out.goalIds ?? []), g.id]));
        continue;
      }
    }
    // tag
    if (w.startsWith("+") && w.length > 1) {
      out.tags = Array.from(new Set([...(out.tags ?? []), w.slice(1)]));
      continue;
    }
    // time HH:mm
    if (/^\d{1,2}:\d{2}$/.test(w)) {
      const [h, mm] = w.split(":");
      out.dueTime = `${h.padStart(2, "0")}:${mm}`;
      continue;
    }
    // explicit date dd/mm or dd-mm
    const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(w);
    if (dm) {
      const now = new Date();
      const year = dm[3]
        ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3])
        : now.getFullYear();
      const d = new Date(year, Number(dm[2]) - 1, Number(dm[1]));
      if (!isNaN(d.getTime())) {
        out.dueDate = isoFrom(d);
        continue;
      }
    }
    // relative words
    if (low === "hoy") {
      out.dueDate = todayISO();
      continue;
    }
    if (low === "manana") {
      out.dueDate = addDays(1);
      continue;
    }
    if (low === "pasado") {
      out.dueDate = addDays(2);
      continue;
    }
    if (low in DAY_TOKENS) {
      out.dueDate = nextWeekday(DAY_TOKENS[low]);
      continue;
    }

    rest.push(w);
  }

  out.name = rest.join(" ").trim();
  if (!out.tags?.length) delete out.tags;
  if (!out.goalIds?.length) delete out.goalIds;
  return out;
}

/** Human summary of what the parser detected, for the live hint. */
export function describeParsed(
  p: ParsedTask,
  activities: Activity[],
  goals: Goal[],
): string[] {
  const chips: string[] = [];
  if (p.priority) chips.push(`prioridad: ${p.priority}`);
  if (p.estimatedMinutes) chips.push(`${p.estimatedMinutes} min`);
  if (p.dueDate) chips.push(p.dueDate === todayISO() ? "hoy" : p.dueDate);
  if (p.dueTime) chips.push(p.dueTime);
  if (p.activityId) {
    const a = activities.find((x) => x.id === p.activityId);
    if (a) chips.push(`#${a.name}`);
  }
  for (const gid of p.goalIds ?? []) {
    const g = goals.find((x) => x.id === gid);
    if (g) chips.push(`@${g.name}`);
  }
  for (const t of p.tags ?? []) chips.push(`+${t}`);
  return chips;
}

export const emptyTaskDraft = (preset?: Partial<Task>): Task => ({
  id: "",
  name: "",
  status: "pending",
  priority: "medium",
  estimatedMinutes: 30,
  createdAt: Date.now(),
  ...preset,
});
