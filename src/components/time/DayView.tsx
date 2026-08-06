import { useMemo, useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { DonutChart } from "@/components/time/DonutChart";
import { Badge } from "@/components/ui/badge";
import {
  activityDays,
  CATEGORIES,
  completionIcon,
  DAY_NAMES,
  DAY_SHORT,
  taskProgress,
  usesTimer,
  type Activity,
  type Goal,
} from "@/lib/time-store";
import { ActivityTimer } from "@/components/time/ActivityTimer";
import { dateKeyOf, dayCompletion, realHoursForDay, useTimerStore } from "@/lib/timer-store";


interface Props {
  activities: Activity[];
  goals: Goal[];
  onEdit: (a: Activity) => void;
  onDuplicate: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  realMode?: boolean;
}

const DAY_TOTAL = 24;

export function DayView({ activities, goals, onEdit, onDuplicate, onDelete, realMode }: Props) {
  const today = ((new Date().getDay() + 6) % 7) as number;
  const [day, setDay] = useState<number>(today);
  const timers = useTimerStore();

  // Selected day → yyyy-mm-dd of the current week, used to scope timer data.
  const dayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (day - today));
    return dateKeyOf(d);
  }, [day, today]);

  const realHours = (a: Activity) =>
    realHoursForDay(timers.data, a, dayKey, a.hoursPerDay, timers.now);
  const dayDone = dayCompletion(timers.data, activities, day, dayKey);


  // Per-day activity counts for selector badges
  const countsPerDay = useMemo(() => {
    const arr = Array(7).fill(0) as number[];
    for (const a of activities) {
      for (const d of activityDays(a)) arr[d]++;
    }
    return arr;
  }, [activities]);

  const dayActivities = useMemo(
    () => activities.filter((a) => activityDays(a).has(day)),
    [activities, day],
  );

  // Sort by hours desc, then name — stable, priority to biggest chunks.
  const sorted = useMemo(
    () =>
      [...dayActivities].sort(
        (a, b) => b.hoursPerDay - a.hoursPerDay || a.name.localeCompare(b.name),
      ),
    [dayActivities],
  );

  // Synthesize activities for the donut so each shows exactly its day hours.
  const donutActivities: Activity[] = useMemo(
    () =>
      sorted.map((a) => ({
        ...a,
        hoursPerDay: realMode ? realHours(a) : a.hoursPerDay,
        // DonutChart uses weeklyHours = hoursPerDay * daysPerWeek — force = hoursPerDay.
        daysPerWeek: 1,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, realMode, timers.data, timers.now, dayKey],
  );

  const occupied = dayActivities.reduce(
    (s, a) => s + (realMode ? realHours(a) : a.hoursPerDay),
    0,
  );
  const free = Math.max(0, DAY_TOTAL - occupied);
  const overflow = occupied > DAY_TOTAL;
  const top = sorted[0];

  // Goals touched today
  const goalsToday = useMemo(() => {
    const ids = new Set<string>();
    for (const a of dayActivities) for (const g of a.goalIds ?? []) ids.add(g);
    return goals.filter((g) => ids.has(g.id));
  }, [dayActivities, goals]);

  // Task stats for the day: tasks dated to that ISO weekday
  const taskToday = useMemo(() => {
    let total = 0,
      done = 0;
    for (const a of dayActivities) {
      for (const t of a.tasks ?? []) {
        if (!t.dueDate) continue;
        const d = new Date(t.dueDate + "T00:00:00");
        if (Number.isNaN(d.getTime())) continue;
        const idx = (d.getDay() + 6) % 7;
        if (idx !== day) continue;
        total++;
        if (t.status === "completed") done++;
      }
    }
    return { total, done, pending: total - done };
  }, [dayActivities, day]);

  return (
    <div className="space-y-6">
      {/* Day selector */}
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_SHORT.map((label, i) => {
          const active = i === day;
          const isToday = i === today;
          return (
            <button
              key={i}
              onClick={() => setDay(i)}
              className={`relative rounded-xl border px-2 py-2.5 text-xs transition ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "hover:bg-accent"
              }`}
            >
              <div className="font-medium leading-none">{label}</div>
              <div
                className={`mt-1 text-[10px] tabular-nums ${
                  active ? "text-background/70" : "text-muted-foreground"
                }`}
              >
                {countsPerDay[i]} {countsPerDay[i] === 1 ? "act" : "acts"}
              </div>
              {isToday && !active && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {/* Chart card */}
      <div className="rounded-3xl border bg-card p-6 md:p-10 shadow-[var(--shadow-soft)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg leading-tight">{DAY_NAMES[day]}</h3>
            <p className="text-xs text-muted-foreground">
              {dayActivities.length}{" "}
              {dayActivities.length === 1 ? "actividad" : "actividades"} · {occupied.toFixed(1)}h
              / 24h
            </p>
          </div>
        </div>
        <DonutChart
          activities={donutActivities}
          total={DAY_TOTAL}
          activeId={timers.active?.activityId ?? null}
          unitLabel="DE 24 HORAS"
          freeLabel="del día"
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
          <div
            className={`px-4 py-2 rounded-full ${
              overflow
                ? "bg-destructive/10 text-destructive"
                : free < 2
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {overflow
              ? `Excedés las 24h por ${(occupied - DAY_TOTAL).toFixed(1)}h`
              : `Te quedan ${free.toFixed(1)}h libres este ${DAY_NAMES[day].toLowerCase()}`}
          </div>
        </div>
      </div>

      {/* Daily stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Ocupado" value={`${occupied.toFixed(1)}h`} sub={`${((occupied / DAY_TOTAL) * 100).toFixed(0)}% del día`} />
        <Stat label="Libre" value={`${free.toFixed(1)}h`} sub={`${((free / DAY_TOTAL) * 100).toFixed(0)}% del día`} />
        <Stat label="Actividades" value={String(dayActivities.length)} sub="programadas" />
        <Stat
          label="Top del día"
          value={top?.name ?? "—"}
          sub={top ? `${top.hoursPerDay}h` : ""}
        />
        <Stat label="Objetivos tocados" value={String(goalsToday.length)} sub={goalsToday.map((g) => g.name).join(" · ") || "—"} />
        <Stat label="Tareas pendientes" value={String(taskToday.pending)} sub={`${taskToday.done}/${taskToday.total} completadas`} />
        <Stat label="Categorías" value={String(new Set(dayActivities.map((a) => a.category)).size)} sub={`de ${CATEGORIES.length}`} />
        <Stat label="Restante ahora" value={`${free.toFixed(1)}h`} sub="hasta llenar el día" />
      </div>

      {/* Activities of the day */}
      <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">Actividades del {DAY_NAMES[day]}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {occupied.toFixed(1)}h / 24h
          </span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay actividades programadas para este día.
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((a) => {
              const tp = taskProgress(a);
              return (
                <li key={a.id} className="py-3 flex items-start gap-3">
                  <span
                    className="mt-1.5 h-3 w-3 rounded-full shrink-0"
                    style={{ background: a.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {a.hoursPerDay}h · {((a.hoursPerDay / DAY_TOTAL) * 100).toFixed(0)}%
                      </span>
                      {tp.total > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {tp.completed}/{tp.total} tareas
                        </span>
                      )}
                    </div>
                    <ActivityTimer activity={a} plannedHours={a.hoursPerDay} dateKey={dayKey} />
                    {(a.goalIds ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(a.goalIds ?? []).map((gid) => {
                          const g = goals.find((x) => x.id === gid);
                          if (!g) return null;
                          return (
                            <span
                              key={gid}
                              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                              style={{
                                background: `color-mix(in oklab, ${g.color} 15%, transparent)`,
                                borderColor: `color-mix(in oklab, ${g.color} 40%, transparent)`,
                              }}
                            >
                              {g.icon ?? "🎯"} {g.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 -mr-1.5">
                    <IconBtn onClick={() => onDuplicate(a)} label="Duplicar">
                      <Copy className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => onEdit(a)} label="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => onDelete(a)} label="Eliminar" danger>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-2xl mt-1 leading-none truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition ${
        danger
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
