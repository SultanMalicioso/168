import type { Activity } from "@/lib/time-store";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

interface Props {
  activities: Activity[];
}

// Simple deterministic distribution: fills each day with activities in order,
// distributing weekly presence across the first `daysPerWeek` days.
export function WeekGrid({ activities }: Props) {
  const HOURS = 24;

  // Build a matrix: [day][hour] -> activity color
  const grid: (Activity | null)[][] = Array.from({ length: 7 }, () =>
    Array(HOURS).fill(null),
  );

  // For each day, stack activities starting at hour 0
  for (let day = 0; day < 7; day++) {
    let cursor = 0;
    for (const a of activities) {
      // is this activity active on this day? distribute across days
      const activeDays = new Set<number>();
      const step = a.daysPerWeek >= 7 ? 1 : 7 / Math.max(a.daysPerWeek, 1);
      for (let i = 0; i < a.daysPerWeek; i++) {
        activeDays.add(Math.floor(i * step) % 7);
      }
      if (!activeDays.has(day)) continue;
      const hrs = Math.min(a.hoursPerDay, HOURS - cursor);
      for (let h = 0; h < hrs; h++) {
        if (cursor + h < HOURS) grid[day][cursor + h] = a;
      }
      cursor = Math.min(HOURS, cursor + hrs);
      if (cursor >= HOURS) break;
    }
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px text-[10px] text-muted-foreground">
        <div />
        {DAYS.map((d, i) => (
          <div key={i} className="text-center pb-1 font-medium">
            {d}
          </div>
        ))}
        {Array.from({ length: HOURS }).map((_, h) => (
          <>
            <div key={`h-${h}`} className="pr-1 text-right tabular-nums leading-[10px]">
              {h % 3 === 0 ? `${h}h` : ""}
            </div>
            {Array.from({ length: 7 }).map((_, d) => {
              const a = grid[d][h];
              return (
                <div
                  key={`c-${d}-${h}`}
                  className="h-[10px] rounded-[2px] border border-border/40"
                  style={{ background: a ? a.color : "transparent" }}
                  title={a ? `${a.name} — ${a.hoursPerDay}h` : ""}
                />
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
