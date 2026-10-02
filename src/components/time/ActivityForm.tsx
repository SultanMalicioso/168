import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Pin, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activityDays,
  CATEGORIES,
  completionMode,
  DAY_SHORT,
  getWeekKey,
  addWeeks,
  mondayKeyOf,
  type Activity,
  type Category,
  type CompletionMode,
  type Goal,
  type Task,
} from "@/lib/time-store";
import { LEAD_OPTIONS, leadLabel } from "@/lib/notify-store";
import {
  describeConflict,
  findScheduleConflicts,
  formatTime,
  parseTime,
} from "@/lib/schedule-conflicts";
import { GoalForm } from "./GoalForm";

type DurationUnit = "min" | "h";
import { TaskList } from "./TaskList";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

interface Props {
  initial?: Activity;
  /** Saved activities, to warn about schedule overlaps. */
  activities: Activity[];
  defaultColor: string;
  goals: Goal[];
  onCreateGoal: (g: Omit<Goal, "id" | "createdAt">) => Goal;
  onCancel: () => void;
  onSubmit: (a: Omit<Activity, "id">) => void;
}

export function ActivityForm({
  initial,
  activities,
  defaultColor,
  goals,
  onCreateGoal,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hoursPerDay, setHoursPerDay] = useState(initial?.hoursPerDay ?? 1);
  /* Typed as a number + unit; stored as hours (max 24 h). */
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(() =>
    (initial?.hoursPerDay ?? 1) < 1 ? "min" : "h",
  );
  const [durationText, setDurationText] = useState(() => {
    const h = initial?.hoursPerDay ?? 1;
    return String(h < 1 ? Math.round(h * 60 * 100) / 100 : h);
  });
  const setDuration = (text: string, unit: DurationUnit) => {
    setDurationText(text);
    setDurationUnit(unit);
    const n = Number(text.replace(",", "."));
    const hours = Number.isFinite(n) && n > 0 ? (unit === "min" ? n / 60 : n) : 0;
    setHoursPerDay(Math.min(24, hours));
  };
  const [dayIndices, setDayIndices] = useState<number[]>(
    initial ? Array.from(activityDays(initial)).sort((a, b) => a - b) : [0, 1, 2, 3, 4],
  );
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [category, setCategory] = useState<Category>(initial?.category ?? "otro");
  const [permanent, setPermanent] = useState<boolean>(initial?.permanent ?? false);
  const [weekOption, setWeekOption] = useState<"current" | "next" | "specific">(
    initial?.weekStart ? "specific" : "current",
  );

  const [specificWeek, setSpecificWeek] = useState(initial?.weekStart ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [goalIds, setGoalIds] = useState<string[]>(initial?.goalIds ?? []);
  const [tasks, setTasks] = useState<Task[]>(initial?.tasks ?? []);
  const [completion, setCompletion] = useState<CompletionMode>(
    initial ? completionMode(initial) : "timer",
  );
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [perDayTimes, setPerDayTimes] = useState(
    () => Object.keys(initial?.dayStartTimes ?? {}).length > 0,
  );
  const [dayTimes, setDayTimes] = useState<Record<string, string>>(
    () => initial?.dayStartTimes ?? {},
  );
  const [reminderMinutes, setReminderMinutes] = useState<string>(
    initial?.reminderMinutes === undefined ? "default" : String(initial.reminderMinutes),
  );
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const startTimeRef = useRef<HTMLInputElement>(null);

  const daysPerWeek = dayIndices.length;
  const toggleDay = (d: number) =>
    setDayIndices((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );

  useEffect(() => {
    if (!initial) setColor(defaultColor);
  }, [defaultColor, initial]);

  const weekly = hoursPerDay * daysPerWeek;
  const toggleGoal = (id: string) =>
    setGoalIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const weekStart =
    weekOption === "current"
      ? getWeekKey()
      : weekOption === "next"
        ? addWeeks(getWeekKey(), 1)
        : mondayKeyOf(specificWeek);

  /* Only the selected days whose time differs from the general one are stored. */
  const dayStartTimes = (() => {
    if (!perDayTimes) return undefined;
    const out: Record<string, string> = {};
    for (const d of dayIndices) {
      const t = dayTimes[String(d)];
      if (t && t !== startTime) out[String(d)] = t;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  })();
  const hasAnyTime = !!startTime || !!dayStartTimes;

  const buildDraft = (): Omit<Activity, "id"> => ({
    weekStart,
    name: name.trim(),
    hoursPerDay,
    daysPerWeek,
    dayIndices: dayIndices.length > 0 ? [...dayIndices].sort((a, b) => a - b) : undefined,
    color,
    category,
    permanent,
    notes: notes.trim() || undefined,
    goalIds: goalIds.length > 0 ? goalIds : undefined,
    completion,
    startTime: startTime || undefined,
    dayStartTimes,
    reminderMinutes: reminderMinutes === "default" ? undefined : Number(reminderMinutes),
    tasks,
  });

  const conflicts = useMemo(
    () =>
      findScheduleConflicts(
        {
          id: initial?.id ?? "__draft__",
          name: name.trim(),
          startTime: startTime || undefined,
          dayStartTimes,
          hoursPerDay,
          dayIndices,
          daysPerWeek: dayIndices.length,
          permanent,
          weekStart,
        },
        activities,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      initial?.id,
      name,
      startTime,
      perDayTimes,
      dayTimes,
      hoursPerDay,
      dayIndices,
      permanent,
      weekStart,
      activities,
    ],
  );

  const startMin = parseTime(startTime);
  const endMin = startMin === null ? null : startMin + Math.round(hoursPerDay * 60);

  const save = () => onSubmit(buildDraft());

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();

          if (!name.trim()) return;
          if (conflicts.length > 0) {
            setConfirmConflicts(true);
            return;
          }
          save();
        }}

        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dormir, Trabajo, Gimnasio…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hpd">Duración por día</Label>
          <div className="flex gap-2">
            <Input
              id="hpd"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              className="flex-1"
              value={durationText}
              onChange={(e) => setDuration(e.target.value, durationUnit)}
            />
            <Select
              value={durationUnit}
              onValueChange={(u) => setDuration(durationText, u as DurationUnit)}
            >
              <SelectTrigger className="w-[7.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="min">Minutos</SelectItem>
                <SelectItem value="h">Horas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="start-time">Horario (opcional)</Label>
            <div className="flex gap-2">
              <Input
                ref={startTimeRef}
                id="start-time"
                type="time"
                className="flex-1 min-w-0"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              {startTime && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setStartTime("")}
                >
                  Quitar
                </Button>
              )}
            </div>
            {!hasAnyTime && (
              <p className="text-[11px] text-muted-foreground">Sin horario: no envía avisos.</p>
            )}
            {startMin !== null && endMin !== null && hoursPerDay > 0 && (
              <p className="text-[11px] text-muted-foreground">
                De {startTime} a {formatTime(endMin)}
                {endMin > 24 * 60 ? " del día siguiente" : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Recordatorio</Label>
            <Select
              value={reminderMinutes}
              onValueChange={setReminderMinutes}
              disabled={!hasAnyTime}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Usar valor por defecto</SelectItem>
                {LEAD_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {leadLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div aria-live="polite">
          {conflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Conflicto de horario
              </p>
              <ul className="mt-1.5 space-y-1 text-foreground">
                {conflicts.map((c) => (
                  <li key={`${c.activityId}-${c.weekKey}-${c.dayIndex}-${c.startMin}`}>
                    Esta actividad se superpone con {describeConflict(c)}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Días de la semana</Label>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setDayIndices([0, 1, 2, 3, 4])}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                L-V
              </button>
              <button
                type="button"
                onClick={() => setDayIndices([0, 1, 2, 3, 4, 5, 6])}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setDayIndices([])}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                Ninguno
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DAY_SHORT.map((label, i) => {
              const on = dayIndices.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  aria-pressed={on}
                  className={`h-10 rounded-lg border text-xs font-medium transition ${
                    on
                      ? "border-transparent text-background"
                      : "bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                  style={on ? { background: color } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {dayIndices.length > 0 && (
            <div className="rounded-xl border p-3 space-y-2">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Horario distinto según el día</span>
                <Switch checked={perDayTimes} onCheckedChange={setPerDayTimes} />
              </label>
              {perDayTimes && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dayIndices.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <Label htmlFor={`day-time-${d}`} className="w-10 shrink-0 text-xs">
                        {DAY_SHORT[d]}
                      </Label>
                      <Input
                        id={`day-time-${d}`}
                        type="time"
                        className="flex-1 min-w-0"
                        value={dayTimes[String(d)] ?? ""}
                        onChange={(e) =>
                          setDayTimes((prev) => ({ ...prev, [String(d)]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                  <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                    {startTime
                      ? `Los días sin hora usan el horario general (${startTime}).`
                      : "Los días sin hora quedan sin horario."}
                  </p>
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            {daysPerWeek === 0
              ? "Elegí al menos un día"
              : `${daysPerWeek} día${daysPerWeek === 1 ? "" : "s"} seleccionado${daysPerWeek === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total semanal</span>{" "}
          <span className="font-semibold">{weekly.toFixed(2)} h</span>
        </div>
        <div className="space-y-1.5">
          <Label>Semana</Label>

          <Select
            value={weekOption}
            onValueChange={(value) => setWeekOption(value as "current" | "next" | "specific")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="current">Esta semana</SelectItem>

              <SelectItem value="next">Próxima semana</SelectItem>

              <SelectItem value="specific">Una semana específica</SelectItem>
            </SelectContent>
          </Select>

          {weekOption === "specific" && (
            <Input
              type="date"
              value={specificWeek}
              onChange={(e) => setSpecificWeek(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* COMPLETION MODE */}
        <div className="space-y-1.5">
          <Label>Modo de finalización</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  id: "timer",
                  icon: "⏱",
                  title: "Con temporizador",
                  sub: "Registrá el tiempo real",
                },
                { id: "manual", icon: "✅", title: "Manual", sub: "Solo marcar como hecha" },
              ] as const
            ).map((o) => {
              const on = completion === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setCompletion(o.id as CompletionMode)}
                  aria-pressed={on}
                  className={`rounded-xl border p-3 text-left transition ${
                    on ? "border-foreground bg-accent" : "hover:border-foreground/30"
                  }`}
                >
                  <div className="text-sm font-medium">
                    {o.icon} {o.title}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{o.sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* GOALS SECTION */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Objetivos
            </Label>
            <span className="text-[10px] text-muted-foreground">
              {goalIds.length === 0 ? "Sin objetivo" : `${goalIds.length} seleccionados`}
            </span>
          </div>
          <div className="rounded-xl border p-2 space-y-1.5 max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => setGoalIds([])}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                goalIds.length === 0 ? "bg-accent" : "hover:bg-muted"
              }`}
            >
              <span
                className={`h-4 w-4 rounded border flex items-center justify-center ${
                  goalIds.length === 0
                    ? "bg-foreground border-foreground"
                    : "border-muted-foreground/40"
                }`}
              >
                {goalIds.length === 0 && <Check className="h-3 w-3 text-background" />}
              </span>
              <span className="text-muted-foreground">Sin objetivo</span>
            </button>
            {goals.map((g) => {
              const on = goalIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGoal(g.id)}
                  className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    on ? "bg-accent" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0`}
                    style={{
                      background: on ? g.color : "transparent",
                      borderColor: on ? g.color : "var(--border)",
                    }}
                  >
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="text-base">{g.icon ?? "🎯"}</span>
                  <span className="flex-1 truncate">{g.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {g.targetHours}h
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowGoalForm(true)}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground border border-dashed"
            >
              <Plus className="h-3.5 w-3.5" /> Crear nuevo objetivo
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full"
                style={{
                  background: c,
                  outline: color === c ? "2px solid var(--foreground)" : "none",
                  outlineOffset: 2,
                }}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-3 bg-muted/20">
          <TaskList tasks={tasks} onChange={setTasks} accentColor={color} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalles o recordatorios sobre esta actividad…"
            rows={2}
          />
        </div>

        <label className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 cursor-pointer">
          <Switch checked={permanent} onCheckedChange={setPermanent} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Pin className="h-3.5 w-3.5" /> Actividad permanente
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Se conserva al iniciar una nueva semana.
            </p>
          </div>
        </label>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-background/95 px-6 py-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">{initial ? "Guardar" : "Agregar"}</Button>
        </div>
      </form>

      <AlertDialog open={confirmConflicts} onOpenChange={setConfirmConflicts}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflicto de horario</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {conflicts.length === 1
                    ? "Esta actividad se superpone con otra:"
                    : `Esta actividad se superpone con ${conflicts.length} horarios:`}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {conflicts.map((c) => (
                    <li key={`${c.activityId}-${c.weekKey}-${c.dayIndex}-${c.startMin}`}>
                      {describeConflict(c)}
                    </li>
                  ))}
                </ul>
                <p>Podés corregir el horario o guardarla igual.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setTimeout(() => startTimeRef.current?.focus(), 0);
              }}
            >
              Revisar horario
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmConflicts(false);
                save();
              }}
            >
              Guardar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showGoalForm} onOpenChange={setShowGoalForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Nuevo objetivo</DialogTitle>
          </DialogHeader>
          <GoalForm
            existing={goals}
            onCancel={() => setShowGoalForm(false)}
            onSubmit={(g) => {
              const created = onCreateGoal(g);
              setGoalIds((prev) => [...prev, created.id]);
              setShowGoalForm(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
