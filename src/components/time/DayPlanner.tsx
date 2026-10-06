import { useMemo, useState } from "react";
import { AlertTriangle, CalendarX, Clock, Copy, Pencil, Pin, Target, Trash2 } from "lucide-react";
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
  formatDuration,
  startTimeOn,
} from "@/lib/time-store";
import {
  findScheduleConflicts,
  formatTime,
  parseTime,
  type ScheduleConflict,
} from "@/lib/schedule-conflicts";

interface Props {
  activities: Activity[];
  /** Every activity of the week, to detect overlaps even while filtering. */
  scheduleActivities?: Activity[];
  goals: Goal[];
  onNew?: () => void;
  onEdit?: (a: Activity) => void;
  onDuplicate?: (a: Activity) => void;
  onDelete?: (a: Activity) => void;
  /** Change the start time of `a` on one weekday only (null = back to its usual time). */
  onSetDayTime?: (a: Activity, day: number, time: string | null) => void;
}

function todayIndex() {
  const js = new Date().getDay(); // 0=Sun
  return (js + 6) % 7;
}

export function DayPlanner({
  activities,
  scheduleActivities,
  goals,
  onNew,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDayTime,
}: Props) {
  const [day, setDay] = useState<number>(todayIndex());

  const perDay = useMemo(() => {
    const buckets: Activity[][] = Array.from({ length: 7 }, () => []);
    for (const a of activities) {
      const days = activityDays(a);
      days.forEach((d) => buckets[d].push(a));
    }
    return buckets;
  }, [activities]);

  const dayActivities = useMemo(() => {
    return [...perDay[day]].sort((a, b) => {
      const sa = startTimeOn(a, day);
      const sb = startTimeOn(b, day);
      if (sa && sb && sa !== sb) return sa.localeCompare(sb);
      if (sa && !sb) return -1;
      if (sb && !sa) return 1;
      const ta = firstDueTime(a, day);
      const tb = firstDueTime(b, day);
      if (ta && tb) return ta.localeCompare(tb);
      if (ta) return -1;
      if (tb) return 1;
      if (b.hoursPerDay !== a.hoursPerDay) return b.hoursPerDay - a.hoursPerDay;
      return a.name.localeCompare(b.name);
    });
  }, [perDay, day]);

  const occupied = dayActivities.reduce((s, a) => s + a.hoursPerDay, 0);
  const capped = Math.min(24, occupied);
  const free = Math.max(0, 24 - capped);
  const pct = (capped / 24) * 100;

  const goalsHit = useMemo(() => {
    const set = new Set<string>();
    for (const a of dayActivities) for (const g of a.goalIds ?? []) set.add(g);
    return set.size;
  }, [dayActivities]);

  const taskAgg = useMemo(() => {
    let done = 0;
    let pending = 0;
    for (const a of dayActivities) {
      const tp = taskProgress(a);
      done += tp.completed;
      pending += tp.pending + tp.inProgress;
    }
    return { done, pending };
  }, [dayActivities]);

  const isToday = day === todayIndex();

  const conflictsOf = useMemo(() => {
    const map = new Map<string, ScheduleConflict[]>();
    for (const a of dayActivities) {
      const list = findScheduleConflicts(a, scheduleActivities ?? activities).filter(
        (c) => c.dayIndex === day && !c.weekKey,
      );
      if (list.length) map.set(a.id, list);
    }
    return map;
  }, [dayActivities, activities, scheduleActivities, day]);

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div
        className="grid grid-cols-7 gap-1 rounded-2xl border bg-muted/40 p-1"
        role="tablist"
        aria-label="Días de la semana"
      >
        {DAY_SHORT.map((label, i) => {
          const selected = i === day;
          const count = perDay[i].length;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={selected}
              onClick={() => setDay(i)}
              className={`relative flex flex-col items-center justify-center rounded-xl px-1 py-2 text-xs transition-all ${
                selected
                  ? "bg-background shadow-sm font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <span className="leading-none">{label}</span>
              <span className="mt-1 text-[9px] tabular-nums opacity-70">
                {count > 0 ? `${count}` : "·"}
              </span>
              {i === todayIndex() && !selected && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {/* Day header + progress */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-xl leading-none">
              {DAY_NAMES[day]}
              {isToday && (
                <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  hoy
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {dayActivities.length} actividad{dayActivities.length === 1 ? "" : "es"} programada
              {dayActivities.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl tabular-nums leading-none">
              {capped.toFixed(1)}
              <span className="text-sm text-muted-foreground">/24h</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              {free.toFixed(1)}h libres
            </p>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            key={day}
            className="h-full bg-foreground transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <MiniStat label="Uso" value={`${pct.toFixed(0)}%`} />
          <MiniStat label="Objetivos" value={String(goalsHit)} />
          <MiniStat label="Pendientes" value={String(taskAgg.pending)} />
          <MiniStat label="Hechas" value={String(taskAgg.done)} />
        </div>

        {occupied > 24 && (
          <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Este día supera las 24h por {(occupied - 24).toFixed(1)}h. Revisá la carga.
          </div>
        )}
      </div>

      {/* Activities list */}
      <div>
        <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Actividades del día
        </h4>

        {dayActivities.length === 0 ? (
          <div
            key={`empty-${day}`}
            className="rounded-2xl border border-dashed p-6 text-center animate-in fade-in duration-200"
          >
            <CalendarX className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              No hay actividades programadas para {DAY_NAMES[day].toLowerCase()}.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Creá una nueva actividad o asigná una existente a este día.
            </p>
            {onNew && (
              <button
                onClick={onNew}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground text-background text-xs px-3 py-1.5 font-medium hover:opacity-90 transition"
              >
                Nueva actividad
              </button>
            )}
          </div>
        ) : (
          <ul key={day} className="space-y-2 animate-in fade-in duration-200">
            {dayActivities.map((a) => (
              <DayCard
                key={a.id}
                activity={a}
                day={day}
                conflicts={conflictsOf.get(a.id) ?? []}
                onSetTime={onSetDayTime ? (t) => onSetDayTime(a, day, t) : undefined}
                goals={goals}
                onEdit={onEdit ? () => onEdit(a) : undefined}
                onDuplicate={onDuplicate ? () => onDuplicate(a) : undefined}
                onDelete={onDelete ? () => onDelete(a) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <div className="font-display text-base tabular-nums leading-none">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function firstDueTime(a: Activity, _day: number): string | null {
  const times = (a.tasks ?? [])
    .map((t) => t.dueTime)
    .filter((x): x is string => !!x)
    .sort();
  return times[0] ?? null;
}

function DayCard({
  activity: a,
  day,
  conflicts,
  onSetTime,
  goals,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  activity: Activity;
  day: number;
  conflicts: ScheduleConflict[];
  onSetTime?: (time: string | null) => void;
  goals: Goal[];
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const tp = taskProgress(a);
  const cat = CATEGORIES.find((c) => c.id === a.category);
  const time = startTimeOn(a, day) ?? "";
  const start = parseTime(time);
  const changedThisDay =
    !!a.dayStartTimes?.[String(day)] && a.dayStartTimes[String(day)] !== a.startTime;
  return (
    <li
      className="group rounded-2xl border bg-card p-3 shadow-[var(--shadow-soft)] transition hover:border-foreground/20"
      style={{ borderLeft: `3px solid ${a.color}` }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              <span title={usesTimer(a) ? "Con temporizador" : "Completación manual"}>
                {completionIcon(a)}
              </span>{" "}
              {a.name}
            </span>

            {a.permanent && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Pin className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{
                background: `color-mix(in oklab, ${a.color} 12%, transparent)`,
                color: "var(--foreground)",
              }}
            >
              {cat?.label ?? a.category}
            </span>
            {(a.goalIds ?? []).slice(0, 2).map((gid) => {
              const g = goals.find((x) => x.id === gid);
              if (!g) return null;
              return (
                <span key={gid} className="inline-flex items-center gap-0.5">
                  <Target className="h-2.5 w-2.5" />
                  {g.icon ?? ""} {g.name}
                </span>
              );
            })}
            {tp.total > 0 && (
              <span className="tabular-nums">
                · {tp.completed}/{tp.total} tareas
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-lg tabular-nums leading-none">
            {formatDuration(a.hoursPerDay)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        {onSetTime ? (
          <input
            type="time"
            aria-label={`Horario de ${a.name} los ${DAY_NAMES[day].toLowerCase()}`}
            value={time}
            onChange={(e) => e.target.value && onSetTime(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 tabular-nums"
          />
        ) : (
          <span className="tabular-nums">{time || "Sin horario"}</span>
        )}
        {start !== null && (
          <span className="text-muted-foreground tabular-nums">
            a {formatTime(start + Math.round(a.hoursPerDay * 60))}
          </span>
        )}
        {changedThisDay && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            · Solo los {DAY_NAMES[day].toLowerCase()}
            {onSetTime && (
              <button
                type="button"
                onClick={() => onSetTime(null)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {a.startTime ? `Volver a ${a.startTime}` : "Quitar"}
              </button>
            )}
          </span>
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
          {conflicts.map((c) => (
            <p key={`${c.activityId}-${c.startMin}`} className="flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px text-amber-700 dark:text-amber-300" />
              <span>
                Se superpone con {c.activityName} de {formatTime(c.startMin)} a{" "}
                {formatTime(c.endMin)}
              </span>
            </p>
          ))}
        </div>
      )}

      {(onEdit || onDuplicate || onDelete) && (
        <div className="mt-2 flex items-center justify-end gap-1 -mr-1">
          {onDuplicate && (
            <MiniBtn onClick={onDuplicate} label="Duplicar">
              <Copy className="h-3 w-3" />
            </MiniBtn>
          )}
          {onEdit && (
            <MiniBtn onClick={onEdit} label="Editar tareas y detalles">
              <Pencil className="h-3 w-3" />
            </MiniBtn>
          )}
          {onDelete && (
            <MiniBtn onClick={onDelete} label="Eliminar" danger>
              <Trash2 className="h-3 w-3" />
            </MiniBtn>
          )}
        </div>
      )}
    </li>
  );
}

function MiniBtn({
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
      className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground transition ${
        danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
