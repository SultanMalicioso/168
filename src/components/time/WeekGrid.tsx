import { activityDays, type Activity } from "@/lib/time-store";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

interface Props {
  activities: Activity[];
}

// Map an ISO date (yyyy-mm-dd) to a weekday index where Monday = 0 … Sunday = 6.
function isoDayIndex(iso: string): number | null {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay(); // 0 = Sun … 6 = Sat
  return (js + 6) % 7;
}

export function WeekGrid({ activities }: Props) {
  const HOURS = 24;

  const grid: (Activity | null)[][] = Array.from({ length: 7 }, () =>
    Array(HOURS).fill(null),
  );

  for (let day = 0; day < 7; day++) {
    let cursor = 0;
    for (const a of activities) {
      const activeDays = activityDays(a);
      if (!activeDays.has(day)) continue;
      const hrs = Math.min(a.hoursPerDay, HOURS - cursor);
      for (let h = 0; h < hrs; h++) {
        if (cursor + h < HOURS) grid[day][cursor + h] = a;
      }
      cursor = Math.min(HOURS, cursor + hrs);
      if (cursor >= HOURS) break;
    }
  }

  // Aggregate dated tasks per weekday (from all activities passed in).
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

  // All activities scheduled per weekday (for the marker row, so nothing gets
  // hidden even if the stacked hours exceed 24h on a given day).
  const activitiesPerDay: Activity[][] = Array.from({ length: 7 }, () => []);
  for (const a of activities) {
    const activeDays = activityDays(a);
    for (const d of activeDays) activitiesPerDay[d].push(a);
  }

  return (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px text-[10px] text-muted-foreground">
        <div />
        {DAYS.map((d, i) => (
          <div key={i} className="text-center pb-1 font-medium">
            {d}
          </div>
        ))}
        {Array.from({ length: HOURS }).flatMap((_, h) => [
          <div key={`h-${h}`} className="pr-1 text-right tabular-nums leading-[10px]">
            {h % 3 === 0 ? `${h}h` : ""}
          </div>,
          ...Array.from({ length: 7 }).map((_, d) => {
            const a = grid[d][h];
            return (
              <div
                key={`c-${d}-${h}`}
                className="h-[10px] rounded-[2px] border border-border/40"
                style={{ background: a ? a.color : "transparent" }}
                title={a ? `${a.name} — ${a.hoursPerDay}h` : ""}
              />
            );
          }),
        ])}
      </div>

      {/* Activity markers row — always shows every scheduled activity per day */}
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px text-[10px]">
        <div className="pr-1 text-right text-muted-foreground">Activ.</div>
        {activitiesPerDay.map((cell, d) => (
          <div
            key={`a-${d}`}
            className="min-h-[18px] rounded-md border border-border/60 bg-muted/20 px-1 py-0.5 flex flex-wrap items-center gap-0.5"
            title={cell.map((a) => `${a.name} — ${a.hoursPerDay}h`).join("\n")}
          >
            {cell.slice(0, 6).map((a) => (
              <span
                key={a.id}
                className="h-1.5 w-3 rounded-[2px]"
                style={{ background: a.color }}
              />
            ))}
            {cell.length > 6 && (
              <span className="text-[9px] text-muted-foreground tabular-nums">
                +{cell.length - 6}
              </span>
            )}
          </div>
        ))}
      </div>


      {/* Task markers row */}
      {tasksPerDay.some((c) => c.length > 0) && (
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px text-[10px]">
          <div className="pr-1 text-right text-muted-foreground">Tareas</div>
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
                {cell.slice(0, 4).map((c) => (
                  <span
                    key={c.task.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: c.activity.color,
                      opacity: c.task.status === "completed" ? 0.35 : 1,
                    }}
                  />
                ))}
                {total > 4 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    +{total - 4}
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
