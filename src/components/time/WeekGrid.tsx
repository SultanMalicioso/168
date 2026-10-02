import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activityDays,
  completionIcon,
  DAY_NAMES,
  DAY_SHORT,
  type Activity,
  formatDuration,
  startTimeOn,
} from "@/lib/time-store";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

interface Props {
  activities: Activity[];
}

/** Activities by start time ("07:00" before "19:00"); untimed ones last, by name. */
function byStartTime(a: Activity, b: Activity, day: number): number {
  const ta = startTimeOn(a, day);
  const tb = startTimeOn(b, day);
  if (ta && tb) {
    return ta.localeCompare(tb) || a.name.localeCompare(b.name);
  }
  if (ta) return -1;
  if (tb) return 1;
  return a.name.localeCompare(b.name);
}

/** Compact duration for narrow columns: "18h15", "8h", "45m". */
function shortDuration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "07:00 – 08:30" (end may roll past midnight). */
function timeRange(a: Activity, day: number): string | null {
  const start = startTimeOn(a, day);
  if (!start) return null;
  const [h, m] = start.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const end = h * 60 + m + Math.round(a.hoursPerDay * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const endLabel = `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
  return `${start} – ${endLabel}`;
}

const endsNextDay = (a: Activity, day: number) => {
  const start = startTimeOn(a, day);
  if (!start) return false;
  const [h, m] = start.split(":").map(Number);
  return h * 60 + m + Math.round(a.hoursPerDay * 60) >= 24 * 60;
};

function isoDayIndex(iso: string): number | null {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay();
  return (js + 6) % 7;
}

export function WeekGrid({ activities }: Props) {
  // Build per-day activity lists (respect explicit dayIndices).
  const perDay: Activity[][] = Array.from({ length: 7 }, () => []);
  for (const a of activities) {
    const days = activityDays(a);
    for (const d of days) perDay[d].push(a);
  }
  perDay.forEach((list, d) => list.sort((a, b) => byStartTime(a, b, d)));

  /** Day opened in the detail dialog (null = closed). */
  const [openDay, setOpenDay] = useState<number | null>(null);

  // Aggregate dated tasks per weekday.
  const tasksPerDay: { activity: Activity; task: NonNullable<Activity["tasks"]>[number] }[][] =
    Array.from({ length: 7 }, () => []);
  for (const a of activities) {
    for (const t of a.tasks ?? []) {
      if (!t.dueDate) continue;
      const d = isoDayIndex(t.dueDate);
      if (d === null) continue;
      tasksPerDay[d].push({ activity: a, task: t });
    }
  }

  const COL_HEIGHT = 260; // px – tall enough to read labels

  return (
    <div className="w-full space-y-2">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 text-[10px] font-medium text-muted-foreground">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center leading-tight">
            <div>{d}</div>
            <span className="block tabular-nums text-muted-foreground">
              {shortDuration(perDay[i].reduce((s, a) => s + a.hoursPerDay, 0))}
            </span>
          </div>
        ))}
      </div>

      {/* Day columns filled proportionally with activity blocks */}
      <div className="grid grid-cols-7 gap-1" style={{ height: COL_HEIGHT }}>
        {perDay.map((list, d) => {
          const total = list.reduce((s, a) => s + a.hoursPerDay, 0);
          // Scale: if total <= 24, use 24h as reference so free time is visible.
          // If total > 24, scale by total so everything fits.
          const scale = Math.max(24, total);
          const freeHours = Math.max(0, 24 - total);
          return (
            <button
              type="button"
              key={d}
              onClick={() => setOpenDay(d)}
              className="relative flex flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20 text-left transition hover:ring-2 hover:ring-foreground/20"
              title={`${DAY_NAMES[d]} — ver detalle de la semana`}
            >
              {list.map((a, i) => {
                const pct = (a.hoursPerDay / scale) * 100;
                return (
                  <div
                    key={`${a.id}-${i}`}
                    className="flex items-center justify-center overflow-hidden px-1 text-[9px] font-medium leading-tight text-foreground/90"
                    style={{
                      height: `${pct}%`,
                      background: a.color,
                      minHeight: 2,
                    }}
                    title={`${completionIcon(a)} ${a.name} — ${formatDuration(a.hoursPerDay)}`}
                  >
                    <span className="truncate mix-blend-luminosity">{pct > 6 ? a.name : ""}</span>
                  </div>
                );
              })}
              {freeHours > 0 && (
                <div
                  className="flex items-center justify-center text-[9px] text-muted-foreground"
                  style={{ height: `${(freeHours / scale) * 100}%` }}
                  title={`Libre — ${formatDuration(freeHours)}`}
                >
                  {freeHours >= 2 ? `${shortDuration(freeHours)} libre` : ""}
                </div>
              )}
              {list.length === 0 && (
                <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground/60">
                  —
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Task markers row */}
      {tasksPerDay.some((c) => c.length > 0) && (
        <div className="grid grid-cols-7 gap-1 text-[10px]">
          {tasksPerDay.map((cell, d) => {
            const total = cell.length;
            const done = cell.filter((c) => c.task.status === "completed").length;
            return (
              <div
                key={`t-${d}`}
                className="min-h-[18px] rounded-md border border-border/60 bg-muted/30 px-1 py-0.5 flex flex-wrap items-center gap-0.5"
                title={cell
                  .map(
                    (c) =>
                      `${c.activity.name}: ${c.task.name}${c.task.dueTime ? " " + c.task.dueTime : ""}`,
                  )
                  .join("\n")}
              >
                {cell.slice(0, 3).map((c) => (
                  <span
                    key={c.task.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: c.activity.color,
                      opacity: c.task.status === "completed" ? 0.35 : 1,
                    }}
                  />
                ))}
                {total > 3 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    +{total - 3}
                  </span>
                )}
                {total > 0 && (
                  <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                    {done}/{total}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        Tocá un día para ver el detalle de la semana
      </p>

      <WeekDetail perDay={perDay} openDay={openDay} onClose={() => setOpenDay(null)} />
    </div>
  );
}

/** Full week, day by day, activities in time order. Opens on the tapped day. */
function WeekDetail({
  perDay,
  openDay,
  onClose,
}: {
  perDay: Activity[][];
  openDay: number | null;
  onClose: () => void;
}) {
  const dayRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (openDay === null) return;
    const id = window.setTimeout(
      () => dayRefs.current[openDay]?.scrollIntoView({ block: "start" }),
      50,
    );
    return () => window.clearTimeout(id);
  }, [openDay]);

  const weekTotal = perDay.reduce((s, list) => s + list.reduce((t, a) => t + a.hoursPerDay, 0), 0);

  return (
    <Dialog open={openDay !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Detalle de la semana</DialogTitle>
          <DialogDescription>
            {formatDuration(weekTotal)} planificadas de 168 h · ordenadas por horario
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {perDay.map((list, d) => {
            const total = list.reduce((s, a) => s + a.hoursPerDay, 0);
            return (
              <section
                key={d}
                ref={(el) => {
                  dayRefs.current[d] = el;
                }}
                className={`scroll-mt-2 rounded-xl border p-3 ${
                  d === openDay ? "border-foreground" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">{DAY_NAMES[d]}</h3>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {formatDuration(total)} · {formatDuration(Math.max(0, 24 - total))} libre
                  </span>
                </div>

                {list.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sin actividades.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((a) => {
                      const range = timeRange(a, d);
                      return (
                        <li key={a.id} className="flex items-center gap-2.5 text-sm">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: a.color }}
                          />
                          <span className="w-[6.75rem] shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {range ?? "Sin horario"}
                            {endsNextDay(a, d) && (
                              <sup className="ml-0.5 text-[9px]" title="Termina al día siguiente">
                                +1
                              </sup>
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{a.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatDuration(a.hoursPerDay)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
