import { useState } from "react";
import { Check, Pause, Play, RotateCcw, Square, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usesTimer, type Activity } from "@/lib/time-store";
import {
  dateKeyOf,
  doneHoursForDay,
  elapsedMs,
  formatClock,
  isCompletedToday,
  remainingMs,
  timerPct,
  useTimerStore,
} from "@/lib/timer-store";

interface Props {
  activity: Activity;
  /** Planned hours for the selected day. Defaults to the activity's hoursPerDay. */
  plannedHours?: number;
  dateKey?: string;
  /** Compact = icon-only row used inside dense lists. */
  compact?: boolean;
}

export function ActivityTimer({ activity, plannedHours, dateKey, compact }: Props) {
  const key = dateKey ?? dateKeyOf();
  const { data, active, now, start, pause, resume, reset, finish, toggleCompletion } = useTimerStore({
    tickFor: activity.id,
  });
  const [conflict, setConflict] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const hours = plannedHours ?? activity.hoursPerDay;
  const mine = active && active.activityId === activity.id;
  const otherActive = active && active.activityId !== activity.id;
  const doneToday = doneHoursForDay(data, activity.id, key, now);
  const completed = isCompletedToday(data, activity.id, key);

  const begin = () => start(activity, hours, key);

  const onStart = () => {
    if (otherActive) {
      setConflict(true);
      return;
    }
    begin();
  };

  const pct = mine ? timerPct(active, now) : hours > 0 ? Math.min(100, (doneToday / hours) * 100) : 0;

  /* ---------- manual mode: no timer controls at all ---------- */
  if (!usesTimer(activity)) {
    return (
      <div className={compact ? "mt-2" : "mt-3"}>
        {completed ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 text-xs font-medium">
              <Check className="h-3.5 w-3.5" /> Completada
            </span>
            <button
              type="button"
              onClick={() => toggleCompletion(activity.id, key)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.97]"
            >
              <Undo2 className="h-3.5 w-3.5" /> Desmarcar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => toggleCompletion(activity.id, key)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition hover:bg-accent active:scale-[0.98]"
            style={{
              borderColor: `color-mix(in oklab, ${activity.color} 45%, transparent)`,
              background: `color-mix(in oklab, ${activity.color} 12%, transparent)`,
            }}
          >
            <Check className="h-4 w-4" /> Marcar como completada
          </button>
        )}
      </div>
    );
  }

  return (

    <div className={compact ? "mt-2" : "mt-3"}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {!mine ? (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-accent active:scale-[0.97]"
            style={{
              borderColor: `color-mix(in oklab, ${activity.color} 45%, transparent)`,
              background: `color-mix(in oklab, ${activity.color} 12%, transparent)`,
            }}
          >
            <Play className="h-3 w-3 fill-current" />
            Iniciar
            <span className="text-muted-foreground tabular-nums">{formatClock(hours * 3_600_000)}</span>
          </button>
        ) : (
          <>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums text-background"
              style={{ background: activity.color }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full bg-background ${
                  active.status === "running" ? "animate-pulse" : "opacity-50"
                }`}
              />
              {formatClock(remainingMs(active, now))}
            </span>
            {active.status === "running" ? (
              <TinyBtn label="Pausar" onClick={pause}>
                <Pause className="h-3.5 w-3.5" />
              </TinyBtn>
            ) : (
              <TinyBtn label="Reanudar" onClick={resume}>
                <Play className="h-3.5 w-3.5" />
              </TinyBtn>
            )}
            <TinyBtn label="Reiniciar" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </TinyBtn>
            <TinyBtn label="Finalizar" onClick={() => setConfirmStop(true)} danger>
              <Square className="h-3.5 w-3.5" />
            </TinyBtn>
          </>
        )}

        {completed && !mine && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
              <Check className="h-3 w-3" /> Completada hoy
            </span>
            <TinyBtn label="Desmarcar" onClick={() => toggleCompletion(activity.id, key)}>
              <Undo2 className="h-3.5 w-3.5" />
            </TinyBtn>
          </>
        )}

      </div>

      {(mine || doneToday > 0) && (
        <div className="mt-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%`, background: activity.color }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>
              {mine ? (active.status === "running" ? "En progreso" : "En pausa") : "Realizado"} ·{" "}
              {(mine ? elapsedMs(active, now) / 3_600_000 : doneToday).toFixed(2)}h de {hours}h
            </span>
            <span>{pct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Only one activity at a time */}
      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Ya hay una actividad en curso
            </AlertDialogTitle>
            <AlertDialogDescription>
              Podés pausar la actividad actual y empezar “{activity.name}”, o seguir con la que ya
              está corriendo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflict(false);
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Mantener la actual
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                pause();
                begin();
                setConflict(false);
              }}
            >
              Pausar e iniciar esta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Early stop */}
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              ¿Finalizar antes de tiempo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se guardará el tiempo realizado ({(elapsedMs(active, now) / 3_600_000).toFixed(2)}h) y
              la actividad no se marcará como completada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                finish(false);
                setConfirmStop(false);
              }}
            >
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TinyBtn({
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
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-full border transition active:scale-95 ${
        danger
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
