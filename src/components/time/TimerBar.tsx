import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Pause, Play, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Activity, Task } from "@/lib/time-store";
import {
  elapsedMs,
  formatClock,
  playChime,
  remainingMs,
  timerPct,
  useTimerStore,
} from "@/lib/timer-store";

interface Props {
  activities: Activity[];
  /** Called when the user confirms which tasks of the session are done. */
  onCompleteTasks?: (activityId: string, taskIds: string[]) => void;
}

/**
 * Global, always-visible timer bar. Owns the auto-finish logic so a running
 * session completes exactly once, no matter which screen is mounted.
 */
export function TimerBar({ activities, onCompleteTasks }: Props) {
  const { data, active, now, settings, pause, resume, reset, finish, setSettings } = useTimerStore();
  const [celebrate, setCelebrate] = useState<Activity | null>(null);
  const [taskPrompt, setTaskPrompt] = useState<{ activity: Activity; tasks: Task[] } | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const finishing = useRef(false);

  const activity = useMemo(
    () => activities.find((a) => a.id === active?.activityId) ?? null,
    [activities, active?.activityId],
  );

  const remaining = active ? remainingMs(active, now) : 0;

  // Auto-complete when the countdown reaches zero.
  useEffect(() => {
    if (!active || active.status !== "running" || remaining > 0 || finishing.current) return;
    finishing.current = true;
    const done = finish(true);
    const act = activities.find((a) => a.id === done?.activityId) ?? null;
    if (settings.sound) playChime();
    if (settings.notifications) {
      toast.success(`✅ ${act?.name ?? "Actividad"} completada`, {
        description: "El tiempo programado se cumplió y ya se actualizó todo.",
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Actividad completada", { body: act?.name ?? "" });
        } catch {
          /* ignore */
        }
      }
    }
    if (act) {
      setCelebrate(act);
      window.setTimeout(() => setCelebrate(null), 2200);
      const pending = (act.tasks ?? []).filter((t) => t.status !== "completed");
      if (pending.length > 0) {
        setPicked(Object.fromEntries(pending.map((t) => [t.id, true])));
        setTaskPrompt({ activity: act, tasks: pending });
      }
    }
    window.setTimeout(() => {
      finishing.current = false;
    }, 500);
  }, [active, remaining, finish, activities, settings]);

  const askPermission = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };

  return (
    <>
      {/* Floating running bar */}
      {active && activity && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-[720px] rounded-2xl border bg-background/90 backdrop-blur-xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div
              className="h-1 transition-[width] duration-300 ease-linear"
              style={{ width: `${timerPct(active, now)}%`, background: activity.color }}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  active.status === "running" ? "animate-pulse" : "opacity-40"
                }`}
                style={{ background: activity.color }}
              />
              <div className="min-w-0 flex-1 order-1">
                <div className="text-sm font-medium truncate">{activity.name}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {active.status === "running" ? "En progreso" : "En pausa"} ·{" "}
                  {(elapsedMs(active, now) / 3_600_000).toFixed(2)}h de{" "}
                  {(active.plannedMs / 3_600_000).toFixed(2)}h · {timerPct(active, now).toFixed(0)}%
                </div>
              </div>
              <div className="font-display text-2xl tabular-nums leading-none order-2">
                {formatClock(remaining)}
              </div>
              <div className="flex items-center gap-0.5 order-3 w-full sm:w-auto justify-between sm:justify-end">
                {active.status === "running" ? (
                  <Button size="icon" variant="ghost" onClick={pause} aria-label="Pausar">
                    <Pause className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" onClick={resume} aria-label="Reanudar">
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={reset} aria-label="Reiniciar">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => finish(false)}
                  aria-label="Finalizar"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSettings({ sound: !settings.sound })}
                  aria-label={settings.sound ? "Silenciar sonido" : "Activar sonido"}
                >
                  {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (!settings.notifications) askPermission();
                    setSettings({ notifications: !settings.notifications });
                  }}
                  aria-label={settings.notifications ? "Silenciar avisos" : "Activar avisos"}
                >
                  {settings.notifications ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion celebration */}
      {celebrate && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
          <div className="rounded-3xl border bg-background/95 backdrop-blur-xl px-8 py-6 text-center shadow-2xl animate-in zoom-in-95 fade-in duration-300">
            <div
              className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: `color-mix(in oklab, ${celebrate.color} 25%, transparent)` }}
            >
              ✅
            </div>
            <div className="font-display text-2xl mt-3">¡Completada!</div>
            <div className="text-sm text-muted-foreground mt-1">{celebrate.name}</div>
          </div>
        </div>
      )}

      {/* Task follow-up */}
      <Dialog
        open={taskPrompt !== null}
        onOpenChange={(v) => {
          if (!v) setTaskPrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              ¿Marcar tareas como completadas?
            </DialogTitle>
            <DialogDescription>
              Terminaste la sesión de “{taskPrompt?.activity.name}”. Elegí qué tareas se completaron.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {taskPrompt?.tasks.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2.5 rounded-lg border p-2.5 text-sm cursor-pointer hover:bg-accent transition">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-current"
                    checked={!!picked[t.id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.checked }))}
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() =>
                setPicked(Object.fromEntries((taskPrompt?.tasks ?? []).map((t) => [t.id, true])))
              }
            >
              Marcar todas
            </Button>
            <Button variant="outline" onClick={() => setTaskPrompt(null)}>
              No marcar ninguna
            </Button>
            <Button
              onClick={() => {
                const ids = Object.entries(picked)
                  .filter(([, v]) => v)
                  .map(([k]) => k);
                if (taskPrompt && ids.length > 0) {
                  onCompleteTasks?.(taskPrompt.activity.id, ids);
                  toast.success(`${ids.length} tarea(s) completadas`);
                }
                setTaskPrompt(null);
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keeps sessions referenced so the bar re-renders on store writes */}
      <span className="hidden">{data.sessions.length}</span>
    </>
  );
}
