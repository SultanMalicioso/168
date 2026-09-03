import {
  activityDays,
  completionMode,
  getWeekKey,
  type Activity,
  type Store,
  type Task,
  type TaskPriority,
} from "@/lib/time-store";
import { LOCAL_DATA_CHANGED_EVENT } from "@/lib/cloud-sync";
import {
  deliver,
  inQuietHours,
  loadNotify,
  updateNotify,
  type NotifyInput,
  type NotifySettings,
} from "@/lib/notify-store";

/* ------------------------------------------------------------------ *
 * Notification engine
 * Single source of truth: it reads the very same persisted stores the
 * charts, calendar and timers use, so any edit is reflected instantly
 * and nothing is ever notified twice (dedupe ledger + grace windows).
 * ------------------------------------------------------------------ */

const STORE_KEY = "week168.v2";
const TIMER_KEY = "week168.timers.v1";

interface TimerSnapshot {
  completions: Record<string, string[]>;
  active: { activityId: string; status: "running" | "paused" } | null;
  sessions: { activityId: string; dateKey: string; durationMs: number }[];
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readStore(): Store | null {
  const raw = readJSON<Store>(STORE_KEY);
  if (!raw || !Array.isArray(raw.activities)) return null;
  return { ...raw, tasks: Array.isArray(raw.tasks) ? raw.tasks : [] };
}

function readTimers(): TimerSnapshot {
  const raw = readJSON<Partial<TimerSnapshot>>(TIMER_KEY);
  return {
    completions: raw?.completions && typeof raw.completions === "object" ? raw.completions : {},
    active: raw?.active ?? null,
    sessions: Array.isArray(raw?.sessions) ? raw!.sessions! : [],
  };
}

/* ---------------- date helpers (local time zone aware) ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

/** Epoch ms of HH:mm on the given local day. Null for malformed input. */
function atTime(day: Date, hhmm?: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (h > 23 || m > 59) return null;
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const fmtHours = (h: number) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} min`;
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm} min`;
};

const CATEGORY_ICON: Record<string, string> = {
  salud: "🩺",
  trabajo: "💼",
  estudio: "📚",
  deporte: "🏋️",
  ocio: "🎮",
  social: "👥",
  transporte: "🚌",
  otro: "📌",
};

const icon = (a: Activity) => CATEGORY_ICON[a.category] ?? "📌";

/* ---------------- selectors ---------------- */

function todaysActivities(store: Store, now: Date): Activity[] {
  const week = getWeekKey(now);
  const idx = dayIndex(now);

  return store.activities.filter((a) => {
    const inWeek = a.permanent || !a.weekStart || a.weekStart === week;
    return inWeek && activityDays(a).has(idx);
  });
}

/** Tasks of the day, from the standalone list and legacy inline lists. */
function todaysTasks(store: Store, now: Date): Task[] {
  const key = dayKey(now);
  const inline = store.activities.flatMap((a) =>
    (a.tasks ?? []).map((t) => ({ ...t, activityId: t.activityId ?? a.id })),
  );
  const seen = new Set<string>();

  return [...store.tasks, ...inline].filter((t) => {
    if (!t || t.deletedAt || t.archived) return false;
    if (t.dueDate !== key) return false;
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

const isPending = (t: Task) => t.status !== "completed";

const completedToday = (timers: TimerSnapshot, activityId: string, key: string) =>
  (timers.completions[key] ?? []).includes(activityId);

/* ---------------- event planning ---------------- */

interface PlannedEvent {
  key: string;
  at: number;
  /** How late the event may still be delivered. */
  graceMs: number;
  input: NotifyInput;
}

const MIN = 60_000;

export function planEvents(now: Date, store: Store, timers: TimerSnapshot, s: NotifySettings): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const key = dayKey(now);
  const acts = todaysActivities(store, now);
  const tasks = todaysTasks(store, now);
  const pending = tasks.filter(isPending);

  /* ---- 4. Morning summary ---- */
  if (s.morning) {
    const at = atTime(now, s.morningTime);
    if (at != null && acts.length + pending.length > 0) {
      const lines = acts
        .slice(0, 6)
        .map((a) => `${icon(a)} ${a.name} — ${fmtHours(a.hoursPerDay)}`)
        .join("\n");
      const extra = acts.length > 6 ? `\n+${acts.length - 6} más` : "";
      events.push({
        key: `morning:${key}`,
        at,
        graceMs: 6 * 3_600_000,
        input: {
          kind: "summary",
          title: "☀️ Buenos días",
          tag: `morning:${key}`,
          body: `Hoy tenés:\n${lines}${extra}\n\n${acts.length} actividad${acts.length === 1 ? "" : "es"} · ${pending.length} tarea${pending.length === 1 ? "" : "s"} pendiente${pending.length === 1 ? "" : "s"}`,
          link: "/",
        },
      });
    }
  }

  /* ---- 5. Grouped task summary ---- */
  if (s.tasks && pending.length > 0) {
    const at = atTime(now, s.morningTime);
    if (at != null) {
      const count = (p: TaskPriority[]) => pending.filter((t) => p.includes(t.priority)).length;
      const urgent = count(["urgent"]);
      const high = count(["high"]);
      const normal = count(["medium", "low"]);
      const parts = [
        urgent > 0 ? `🔴 ${urgent} urgente${urgent === 1 ? "" : "s"}` : null,
        high > 0 ? `🟠 ${high} importante${high === 1 ? "" : "s"}` : null,
        normal > 0 ? `⚪ ${normal} normal${normal === 1 ? "" : "es"}` : null,
      ].filter(Boolean);

      events.push({
        key: `tasksum:${key}`,
        at: at + 2 * MIN,
        graceMs: 6 * 3_600_000,
        input: {
          kind: "task",
          title: "📋 Tareas de hoy",
          tag: `tasksum:${key}`,
          body: parts.join("\n"),
          link: "/todo",
        },
      });
    }
  }

  /* ---- 1 + 2 + 6. Activity events ---- */
  if (s.activities) {
    for (const a of acts) {
      const start = atTime(now, a.startTime);
      if (start == null) continue; // activities without a time never nag

      const done = completedToday(timers, a.id, key);
      const running = timers.active?.activityId === a.id;
      const linkedPending = pending.filter((t) => t.activityId === a.id);

      if (!done && !running) {
        const lead = a.reminderMinutes ?? s.defaultLead;
        if (lead > 0) {
          events.push({
            key: `rem:${a.id}:${key}:${lead}:${a.startTime}`,
            at: start - lead * MIN,
            graceMs: 10 * MIN,
            input: {
              kind: "activity",
              title: `${icon(a)} ${a.name} en ${lead >= 60 ? "1 hora" : `${lead} min`}`,
              tag: `rem:${a.id}:${key}`,
              body: `Empieza a las ${a.startTime}. Tenés ${fmtHours(a.hoursPerDay)} programados.`,
              color: a.color,
              activityId: a.id,
              link: "/",
            },
          });
        }

        events.push({
          key: `start:${a.id}:${key}:${a.startTime}`,
          at: start,
          graceMs: 20 * MIN,
          input: {
            kind: "activity",
            title: `${icon(a)} Es hora de ${a.name}`,
            tag: `start:${a.id}:${key}`,
            body:
              `Tenés ${fmtHours(a.hoursPerDay)} programados.` +
              (completionMode(a) === "timer" ? "\nAbrí la app para iniciar el temporizador." : "") +
              (linkedPending.length > 0
                ? `\n📚 ${linkedPending.length} tarea${linkedPending.length === 1 ? "" : "s"} pendiente${linkedPending.length === 1 ? "" : "s"}.`
                : ""),
            color: a.color,
            activityId: a.id,
            link: "/",
          },
        });
      }

      /* ---- 6. Pending tasks once the activity window ended ---- */
      if (s.pendingTasks && linkedPending.length > 0) {
        const end = start + Math.max(0.25, a.hoursPerDay) * 3_600_000;
        events.push({
          key: `pend:${a.id}:${key}`,
          at: end,
          graceMs: 90 * MIN,
          input: {
            kind: "task",
            title: "⚠️ Todavía tenés tareas pendientes",
            tag: `pend:${a.id}:${key}`,
            body: `Te queda${linkedPending.length === 1 ? "" : "n"} ${linkedPending.length} tarea${linkedPending.length === 1 ? "" : "s"} de "${a.name}".`,
            color: a.color,
            activityId: a.id,
            link: "/todo",
          },
        });
      }
    }
  }

  /* ---- 3. Individual task reminders (only when they have a time) ---- */
  if (s.tasks) {
    for (const t of pending) {
      const when = t.startTime ?? t.dueTime;
      const at = atTime(now, when);
      if (at == null) continue;

      const lead = s.defaultLead;
      events.push({
        key: `task:${t.id}:${key}:${when}`,
        at: at - lead * MIN,
        graceMs: 20 * MIN,
        input: {
          kind: "task",
          title: `📝 ${t.name}`,
          tag: `task:${t.id}:${key}`,
          body: `${t.startTime ? `Empieza ${t.startTime}` : `Vence ${t.dueTime}`}${t.estimatedMinutes ? ` · ${t.estimatedMinutes} min` : ""}`,
          taskId: t.id,
          activityId: t.activityId,
          link: "/todo",
        },
      });
    }
  }

  /* ---- 7. Completion confirmations ---- */
  if (s.completions) {
    for (const id of timers.completions[key] ?? []) {
      const a = store.activities.find((x) => x.id === id);
      if (!a) continue; // deleted activities never notify
      events.push({
        key: `done:${id}:${key}`,
        at: now.getTime(),
        graceMs: 12 * 3_600_000,
        input: {
          kind: "activity",
          title: "✅ Actividad completada",
          tag: `done:${id}:${key}`,
          body: `"${a.name}" terminado.`,
          color: a.color,
          activityId: a.id,
          link: "/",
        },
      });
    }
  }

  /* ---- 8. Night summary (real data only) ---- */
  if (s.night) {
    const at = atTime(now, s.nightTime);
    if (at != null && (acts.length > 0 || tasks.length > 0)) {
      const doneActs = acts.filter((a) => completedToday(timers, a.id, key));
      const doneTasks = tasks.filter((t) => t.status === "completed");
      const total = acts.length + tasks.length;
      const done = doneActs.length + doneTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const left = [
        ...acts.filter((a) => !completedToday(timers, a.id, key)).map((a) => a.name),
        ...tasks.filter(isPending).map((t) => t.name),
      ].slice(0, 4);

      events.push({
        key: `night:${key}`,
        at,
        graceMs: 3 * 3_600_000,
        input: {
          kind: "summary",
          title: "🌙 Resumen del día",
          tag: `night:${key}`,
          body:
            `${doneActs.length}/${acts.length} actividades completadas\n` +
            `${doneTasks.length}/${tasks.length} tareas completadas\n` +
            `${pct} % del día cumplido` +
            (left.length > 0 ? `\n\nTe quedó pendiente:\n${left.map((n) => `• ${n}`).join("\n")}` : ""),
          link: "/calendar",
        },
      });
    }
  }

  return events;
}

/* ---------------- tick loop ---------------- */

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const data = loadNotify();
    if (!data.settings.enabled) return;

    const store = readStore();
    if (!store) return;

    const now = new Date();
    const timers = readTimers();
    const events = planEvents(now, store, timers, data.settings);
    const quiet = inQuietHours(data.settings, now);
    const nowMs = now.getTime();

    const due = events.filter(
      (e) => !data.sent[e.key] && e.at <= nowMs && nowMs - e.at <= e.graceMs,
    );

    if (due.length === 0) return;

    /* During quiet hours nothing is shown, and nothing piles up for later. */
    if (quiet) {
      updateNotify((d) => {
        const sent = { ...d.sent };
        for (const e of due) sent[e.key] = nowMs;
        return { ...d, sent };
      });
      return;
    }

    /* Reserve the keys first: no duplicates even if delivery is slow. */
    updateNotify((d) => {
      const sent = { ...d.sent };
      for (const e of due) sent[e.key] = nowMs;
      return { ...d, sent };
    });

    for (const e of due.sort((a, b) => a.at - b.at)) {
      await deliver(e.input, Math.max(e.at, nowMs - e.graceMs));
    }
  } finally {
    running = false;
  }
}

const schedule = () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void tick(), 800);
};

export function startNotifyEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  void tick();

  timer = setInterval(() => void tick(), 20_000);

  window.addEventListener(LOCAL_DATA_CHANGED_EVENT, (event) => {
    const key = (event as CustomEvent<{ key?: string }>).detail?.key;
    if (key === STORE_KEY || key === TIMER_KEY) schedule();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });

  window.addEventListener("focus", schedule);
}

export function stopNotifyEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
