import { activityDays, DAY_SHORT, type Activity } from "@/lib/time-store";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

interface Props {
  activities: Activity[];
}

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
          <div key={i} className="text-center">
            {d}
            <span className="ml-1 tabular-nums text-muted-foreground/70">
              {perDay[i].reduce((s, a) => s + a.hoursPerDay, 0)}h
            </span>
          </div>
        ))}
      </div>

      {/* Day columns filled proportionally with activity blocks */}
      <div
        className="grid grid-cols-7 gap-1"
        style={{ height: COL_HEIGHT }}
      >
        {perDay.map((list, d) => {
          const total = list.reduce((s, a) => s + a.hoursPerDay, 0);
          // Scale: if total <= 24, use 24h as reference so free time is visible.
          // If total > 24, scale by total so everything fits.
          const scale = Math.max(24, total);
          const freeHours = Math.max(0, 24 - total);
          return (
            <div
              key={d}
              className="relative flex flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20"
              title={DAY_SHORT[d]}
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
                    title={`${a.name} — ${a.hoursPerDay}h`}
                  >
                    <span className="truncate mix-blend-luminosity">
                      {pct > 6 ? a.name : ""}
                    </span>
                  </div>
                );
              })}
              {freeHours > 0 && (
                <div
                  className="flex items-center justify-center text-[9px] text-muted-foreground/70"
                  style={{ height: `${(freeHours / scale) * 100}%` }}
                  title={`Libre — ${freeHours}h`}
                >
                  {freeHours >= 2 ? `${freeHours}h libre` : ""}
                </div>
              )}
              {list.length === 0 && (
                <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground/60">
                  —
                </div>
              )}
            </div>
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
    </div>
  );
}
