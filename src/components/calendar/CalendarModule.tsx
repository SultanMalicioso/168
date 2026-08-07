import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DAY_STATUS_META,
  computeStats,
  dayIndexOfKey,
  isFutureKey,
  keysBetween,
  parseKey,
  useHistoryStore,
  type DaySnapshot,
  type DayStatus,
} from "@/lib/history-store";
import { DAY_NAMES, DAY_SHORT, type Activity, type Goal, type Task } from "@/lib/time-store";
import { dateKeyOf, weekStart, type TimerData } from "@/lib/timer-store";

type View = "week" | "month" | "year";

interface Props {
  activities: Activity[];
  goals: Goal[];
  tasks: Task[];
  timers: TimerData;
  now?: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Heat color by completion percentage — shared by every view. */
function heatColor(d: DaySnapshot): string {
  if (d.status === "empty") return "oklch(0.9 0.005 250)";
  if (isFutureKey(d.dateKey)) return "oklch(0.93 0.004 250)";
  if (d.status === "completed" || d.pct >= 100) return "oklch(0.58 0.17 155)";
  if (d.pct >= 80) return "oklch(0.72 0.15 155)";
  if (d.pct >= 50) return "oklch(0.8 0.15 90)";
  if (d.pct > 0) return "oklch(0.68 0.19 30)";
  return "oklch(0.88 0.01 250)";
}

export function CalendarModule({ activities, goals, tasks, timers, now }: Props) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const history = useHistoryStore({ activities, goals, tasks, timers, now });

  /* ---- range per view (same data source for the three of them) ---- */
  const range = useMemo(() => {
    if (view === "week") {
      const s = weekStart(cursor);
      return keysBetween(s, new Date(s.getTime() + 6 * 86400000));
    }
    if (view === "month") {
      const s = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const e = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return keysBetween(s, e);
    }
    return keysBetween(new Date(cursor.getFullYear(), 0, 1), new Date(cursor.getFullYear(), 11, 31));
  }, [view, cursor]);

  const days = useMemo(() => history.getDays(range), [history, range]);
  const stats = useMemo(() => computeStats(days), [days]);
  const byKey = useMemo(() => new Map(days.map((d) => [d.dateKey, d])), [days]);
  const selectedDay = selected ? (byKey.get(selected) ?? history.getDay(selected)) : null;

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else if (view === "month") d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setCursor(d);
  };

  const rangeLabel =
    view === "week"
      ? `${parseKey(range[0]).getDate()} – ${parseKey(range[range.length - 1]).getDate()} ${MONTHS[parseKey(range[range.length - 1]).getMonth()]}`
      : view === "month"
        ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
        : String(cursor.getFullYear());

  return (
    <div className="space-y-6">
      {/* Header: view switcher + range navigation */}
      <div className="rounded-3xl border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)] space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-xl border p-1 bg-muted/40">
            {(["week", "month", "year"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  view === v
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "week" ? "Semana" : v === "month" ? "Mes" : "Año"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-medium tabular-nums">{rangeLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setCursor(new Date())}>
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              aria-label="Configuración del calendario"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div key={view} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          {view === "week" && <WeekView days={days} onSelect={setSelected} />}
          {view === "month" && <MonthView days={days} cursor={cursor} onSelect={setSelected} />}
          {view === "year" && <YearView days={days} onSelect={setSelected} />}
        </div>

        <Legend />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Días completados" value={String(stats.completed)} sub={`de ${stats.tracked} con actividades`} />
        <Stat label="Días incompletos" value={String(stats.incomplete)} sub={`${stats.inProgress} en progreso`} />
        <Stat label="Cumplimiento" value={`${stats.compliance.toFixed(0)}%`} sub="del período" />
        <Stat label="Racha actual" value={`${stats.currentStreak}d`} sub={`Mejor racha: ${stats.bestStreak}d`} icon={<Flame className="h-3.5 w-3.5" />} />
        <Stat label="Promedio semanal" value={`${stats.weeklyAvg.toFixed(1)}d`} sub="días completados / semana" />
        <Stat label="Promedio mensual" value={`${stats.monthlyAvg.toFixed(1)}d`} sub="días completados / mes" />
        <Stat label="Promedio anual" value={`${stats.yearlyAvg.toFixed(0)}d`} sub="proyección a 365 días" />
        <Stat label="Tiempo completado" value={`${stats.totalHours.toFixed(1)}h`} sub="registrado en el período" />
        <Stat
          label="Actividad más cumplida"
          value={stats.bestActivity?.name ?? "—"}
          sub={stats.bestActivity ? `${stats.bestActivity.pct.toFixed(0)}% de cumplimiento` : "sin datos"}
        />
        <Stat
          label="Actividad menos cumplida"
          value={stats.worstActivity?.name ?? "—"}
          sub={stats.worstActivity ? `${stats.worstActivity.pct.toFixed(0)}% de cumplimiento` : "sin datos"}
        />
        <Stat label="Sesiones" value={String(days.reduce((s, d) => s + d.sessions, 0))} sub="de temporizador" />
        <Stat
          label="Tareas completadas"
          value={String(days.reduce((s, d) => s + d.tasksDone, 0))}
          sub={`de ${days.reduce((s, d) => s + d.tasksTotal, 0)} programadas`}
        />
      </div>

      <DayDetail day={selectedDay} onClose={() => setSelected(null)} />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración del calendario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Qué hacer con los días sin actividades programadas?
            </p>
            {(["ignore", "complete"] as const).map((m) => (
              <button
                key={m}
                onClick={() => history.setEmptyDayMode(m)}
                className={`w-full text-left rounded-xl border p-3 transition ${
                  history.emptyDayMode === m ? "border-foreground bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="text-sm font-medium">
                  {m === "ignore" ? "Ignorar el día" : "Considerarlo completado"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {m === "ignore"
                    ? "No afecta rachas ni estadísticas."
                    : "Cuenta como día completado en rachas y porcentajes."}
                </div>
              </button>
            ))}
            <Button variant="outline" className="w-full" onClick={() => history.clearHistory()}>
              Borrar instantáneas del historial
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------- views ------------------------- */

function WeekView({ days, onSelect }: { days: DaySnapshot[]; onSelect: (k: string) => void }) {
  const todayKey = dateKeyOf();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {days.map((d) => {
        const meta = DAY_STATUS_META[d.status];
        return (
          <button
            key={d.dateKey}
            onClick={() => onSelect(d.dateKey)}
            className={`rounded-2xl border p-3 text-left transition hover:shadow-[var(--shadow-soft)] ${
              d.dateKey === todayKey ? "border-foreground" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{DAY_SHORT[dayIndexOfKey(d.dateKey)]}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {parseKey(d.dateKey).getDate()}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl leading-none">{d.pct.toFixed(0)}</span>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${d.pct}%`, background: heatColor(d) }}
              />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {meta.dot} {meta.label}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {d.done}/{d.total} actividades
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  cursor,
  onSelect,
}: {
  days: DaySnapshot[];
  cursor: Date;
  onSelect: (k: string) => void;
}) {
  const todayKey = dateKeyOf();
  const lead = ((new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7) as number;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DAY_SHORT.map((s) => (
          <div key={s} className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            {s}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`p${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d.dateKey}
            onClick={() => onSelect(d.dateKey)}
            title={`${DAY_STATUS_META[d.status].label} · ${d.pct.toFixed(0)}%`}
            className={`aspect-square rounded-xl border p-1 flex flex-col items-center justify-center transition hover:scale-[1.04] ${
              d.dateKey === todayKey ? "border-foreground" : "border-transparent"
            }`}
            style={{ background: `color-mix(in oklab, ${heatColor(d)} 22%, transparent)` }}
          >
            <span className="text-xs tabular-nums font-medium">{parseKey(d.dateKey).getDate()}</span>
            <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: heatColor(d) }} />
            <span className="text-[9px] text-muted-foreground tabular-nums hidden sm:block">
              {d.total > 0 ? `${d.done}/${d.total}` : "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function YearView({ days, onSelect }: { days: DaySnapshot[]; onSelect: (k: string) => void }) {
  // GitHub-style: columns = weeks, rows = weekdays (Mon → Sun).
  const columns = useMemo(() => {
    const cols: (DaySnapshot | null)[][] = [];
    let col: (DaySnapshot | null)[] = Array(7).fill(null);
    for (const d of days) {
      const idx = dayIndexOfKey(d.dateKey);
      if (idx === 0 && col.some(Boolean)) {
        cols.push(col);
        col = Array(7).fill(null);
      }
      col[idx] = d;
    }
    if (col.some(Boolean)) cols.push(col);
    return cols;
  }, [days]);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px] min-w-max">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d, ri) =>
              d ? (
                <button
                  key={d.dateKey}
                  onClick={() => onSelect(d.dateKey)}
                  title={`${d.dateKey} · ${DAY_STATUS_META[d.status].label} · ${d.pct.toFixed(0)}%`}
                  className="h-[11px] w-[11px] rounded-[3px] transition hover:ring-2 hover:ring-foreground/40"
                  style={{ background: heatColor(d) }}
                />
              ) : (
                <div key={`${ci}-${ri}`} className="h-[11px] w-[11px]" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const items: { status: DayStatus; label: string }[] = [
    { status: "completed", label: "Completado" },
    { status: "in_progress", label: "En progreso" },
    { status: "incomplete", label: "Incompleto" },
    { status: "empty", label: "Sin actividades" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.status} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DAY_STATUS_META[i.status].color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------- day detail ------------------------- */

function DayDetail({ day, onClose }: { day: DaySnapshot | null; onClose: () => void }) {
  if (!day) return null;
  const date = parseKey(day.dateKey);
  const meta = DAY_STATUS_META[day.status];
  const pending = day.activities.filter((a) => !a.done);
  const done = day.activities.filter((a) => a.done);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {DAY_NAMES[day.dayIndex]} {date.getDate()} de {MONTHS[date.getMonth()]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border p-3">
            <div>
              <div className="text-sm font-medium">
                {meta.dot} {meta.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {day.done}/{day.total} actividades · {day.pct.toFixed(0)}% completado
              </div>
            </div>
            {day.frozenAt && (
              <span className="text-[10px] rounded-full border px-2 py-0.5 text-muted-foreground">
                histórico
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Mini label="Planificado" value={`${day.plannedHours.toFixed(1)}h`} />
            <Mini label="Ejecutado" value={`${day.realHours.toFixed(1)}h`} />
            <Mini label="Tareas" value={`${day.tasksDone}/${day.tasksTotal}`} />
            <Mini label="Sesiones" value={`${day.sessions} · ${day.sessionMinutes}min`} />
          </div>

          <Section title={`Realizadas (${done.length})`} items={done} empty="Ninguna todavía." />
          <Section title={`Pendientes (${pending.length})`} items={pending} empty="Todo listo 🎉" />

          {day.goals.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                Objetivos tocados
              </div>
              <div className="flex flex-wrap gap-1.5">
                {day.goals.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      background: `color-mix(in oklab, ${g.color} 15%, transparent)`,
                      borderColor: `color-mix(in oklab, ${g.color} 40%, transparent)`,
                    }}
                  >
                    {g.icon ?? "🎯"} {g.name} · {g.hours.toFixed(1)}h
                  </span>
                ))}
              </div>
            </div>
          )}

          {day.status === "completed" && day.total > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" /> Día completado automáticamente
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: DaySnapshot["activities"];
  empty: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
              <span className="truncate flex-1">
                {a.mode === "timer" ? "⏱" : "✅"} {a.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {a.realHours.toFixed(1)}/{a.plannedHours}h
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl mt-1 leading-none truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}
