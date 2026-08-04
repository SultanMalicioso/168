import { useState } from "react";
import type { Store, Task } from "@/lib/time-store";
import {
  allTasks,
  fmtMinutes,
  taskColor,
  taskMinutes,
  todayISO,
  weekDays,
} from "@/lib/task-utils";

const SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function WeekStrip({
  store,
  onDrop,
  onOpen,
}: {
  store: Store;
  onDrop: (taskId: string, dueDate: string) => void;
  onOpen: (t: Task) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const days = weekDays();
  const all = allTasks(store);

  return (
    <div className="rounded-3xl border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-display text-lg">Esta semana</h3>
        <span className="text-[11px] text-muted-foreground text-right">
          Arrastrá tareas entre días · en móvil usá “Reprogramar”
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="grid grid-cols-7 gap-2 min-w-[640px] px-1">
          {days.map((iso, i) => {
            const dayTasks = all.filter((t) => t.dueDate === iso);
            const isToday = iso === todayISO();
            const isOver = over === iso;
            const totalMin = dayTasks.reduce((s, t) => s + taskMinutes(t), 0);
            const doneCount = dayTasks.filter((t) => t.status === "completed").length;
            return (
              <div
                key={iso}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(iso);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setOver(null);
                  if (id) onDrop(id, iso);
                }}
                className={`rounded-xl border p-2 min-h-[120px] transition ${
                  isOver
                    ? "border-foreground ring-2 ring-foreground/20 bg-accent/40"
                    : isToday
                      ? "border-foreground/40 bg-accent/20"
                      : "border-border"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-medium">{SHORT[i]}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {Number(iso.slice(8))}
                  </div>
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onClick={() => onOpen(t)}
                      className={`w-full text-left text-[11px] px-1.5 py-1 rounded-md truncate cursor-grab active:cursor-grabbing ${
                        t.status === "completed" ? "line-through opacity-60" : ""
                      }`}
                      style={{
                        background: `color-mix(in oklab, ${taskColor(t, store)} 25%, transparent)`,
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                  {dayTasks.length > 4 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayTasks.length - 4} más
                    </div>
                  )}
                  {dayTasks.length === 0 && (
                    <div className="text-[10px] text-muted-foreground/60 italic px-1">—</div>
                  )}
                </div>
                {totalMin > 0 && (
                  <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums text-right">
                    {doneCount}/{dayTasks.length} · {fmtMinutes(totalMin)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
