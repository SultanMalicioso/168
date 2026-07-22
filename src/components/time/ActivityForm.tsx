import { useEffect, useState } from "react";
import { Check, Pin, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activityDays, CATEGORIES, DAY_SHORT, type Activity, type Category, type Goal, type Task } from "@/lib/time-store";
import { GoalForm } from "./GoalForm";
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
  defaultColor: string;
  goals: Goal[];
  onCreateGoal: (g: Omit<Goal, "id" | "createdAt">) => Goal;
  onCancel: () => void;
  onSubmit: (a: Omit<Activity, "id">) => void;
}

export function ActivityForm({
  initial,
  defaultColor,
  goals,
  onCreateGoal,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hoursPerDay, setHoursPerDay] = useState(initial?.hoursPerDay ?? 1);
  const [dayIndices, setDayIndices] = useState<number[]>(
    initial ? Array.from(activityDays(initial)).sort((a, b) => a - b) : [0, 1, 2, 3, 4],
  );
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [category, setCategory] = useState<Category>(initial?.category ?? "otro");
  const [permanent, setPermanent] = useState<boolean>(initial?.permanent ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [goalIds, setGoalIds] = useState<string[]>(initial?.goalIds ?? []);
  const [tasks, setTasks] = useState<Task[]>(initial?.tasks ?? []);
  const [showGoalForm, setShowGoalForm] = useState(false);

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

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit({
            name: name.trim(),
            hoursPerDay,
            daysPerWeek,
            dayIndices: dayIndices.length > 0 ? [...dayIndices].sort((a, b) => a - b) : undefined,
            color,
            category,
            permanent,
            notes: notes.trim() || undefined,
            goalIds: goalIds.length > 0 ? goalIds : undefined,
            tasks,
          });
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
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="hpd">Horas por día</Label>
            <Input
              id="hpd"
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={hoursPerDay}
              onChange={(e) =>
                setHoursPerDay(Math.max(0, Math.min(24, Number(e.target.value) || 0)))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpw">Días por semana</Label>
            <Input
              id="dpw"
              type="number"
              min={0}
              max={7}
              step={1}
              value={daysPerWeek}
              onChange={(e) =>
                setDaysPerWeek(Math.max(0, Math.min(7, Number(e.target.value) || 0)))
              }
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total semanal</span>{" "}
          <span className="font-semibold">{weekly.toFixed(2)} h</span>
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
                  goalIds.length === 0 ? "bg-foreground border-foreground" : "border-muted-foreground/40"
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

        <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">{initial ? "Guardar" : "Agregar"}</Button>
        </div>
      </form>

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
