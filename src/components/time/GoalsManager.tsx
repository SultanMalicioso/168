import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Power, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Activity,
  Goal,
  goalProgress,
  PROGRESS_COLORS,
  PROGRESS_LABEL,
  progressState,
  weeklyHours,
} from "@/lib/time-store";
import { GoalForm } from "./GoalForm";

interface Props {
  goals: Goal[];
  activities: Activity[];
  onGoalsChange: (g: Goal[]) => void;
  onActivitiesChange: (a: Activity[]) => void;
}

export function GoalsManager({ goals, activities, onGoalsChange, onActivitiesChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const save = (g: Omit<Goal, "id" | "createdAt">) => {
    if (editing) {
      onGoalsChange(goals.map((x) => (x.id === editing.id ? { ...editing, ...g } : x)));
    } else {
      onGoalsChange([...goals, { ...g, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2), createdAt: Date.now() }]);
    }
    setEditing(null);
    setOpen(false);
  };

  const remove = (id: string) => {
    // Detach activities (they stay, just lose the link)
    onActivitiesChange(
      activities.map((a) =>
        a.goalIds?.includes(id) ? { ...a, goalIds: a.goalIds.filter((g) => g !== id) } : a,
      ),
    );
    onGoalsChange(goals.filter((g) => g.id !== id));
  };

  const toggleActive = (id: string) => {
    onGoalsChange(goals.map((g) => (g.id === id ? { ...g, active: !g.active } : g)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg leading-tight flex items-center gap-2">
            <Target className="h-4 w-4" /> Objetivos
          </h2>
          <p className="text-xs text-muted-foreground">
            {goals.filter((g) => g.active).length} activos · progreso automático
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Objetivo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                {editing ? "Editar objetivo" : "Nuevo objetivo"}
              </DialogTitle>
            </DialogHeader>
            <GoalForm
              initial={editing ?? undefined}
              existing={goals}
              onCancel={() => {
                setOpen(false);
                setEditing(null);
              }}
              onSubmit={save}
            />
          </DialogContent>
        </Dialog>
      </div>

      {goals.length === 0 && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Todavía no creaste objetivos. Agrupá actividades por prioridad para verlas juntas.
        </p>
      )}

      <div className="space-y-2">
        {goals.map((g) => {
          const { hours, linked, pct, remaining } = goalProgress(g, activities);
          const state = progressState(pct);
          const color = PROGRESS_COLORS[state];
          const isOpen = expanded === g.id;
          return (
            <div
              key={g.id}
              className={`rounded-2xl border bg-card p-3 transition ${
                g.active ? "" : "opacity-55"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `color-mix(in oklab, ${g.color} 20%, transparent)` }}
                >
                  {g.icon || <Target className="h-4 w-4" style={{ color: g.color }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{g.name}</span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-normal"
                      style={{
                        background: `color-mix(in oklab, ${color} 15%, transparent)`,
                        color,
                      }}
                    >
                      {PROGRESS_LABEL[state]}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    <span className="text-foreground font-semibold">{hours.toFixed(1)}h</span>
                    {" / "}
                    {g.targetHours}h · {linked.length} act. · {pct.toFixed(0)}%
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(isOpen ? null : g.id)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                  aria-label="Detalles"
                >
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden relative">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: color,
                  }}
                />
                {pct > 100 && (
                  <div
                    className="absolute top-0 right-0 h-full opacity-40"
                    style={{ width: `${Math.min(100, pct - 100)}%`, background: color }}
                  />
                )}
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {g.description && (
                    <p className="text-xs text-muted-foreground">{g.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <MiniStat label="% semana" value={`${((hours / 168) * 100).toFixed(1)}%`} />
                    <MiniStat label="Prom/día" value={`${(hours / 7).toFixed(1)}h`} />
                    <MiniStat
                      label={pct >= 100 ? "Extra" : "Falta"}
                      value={pct >= 100 ? `+${(hours - g.targetHours).toFixed(1)}h` : `${remaining.toFixed(1)}h`}
                    />
                  </div>
                  {linked.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {linked.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                          {a.name} · {weeklyHours(a).toFixed(1)}h
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setEditing(g);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleActive(g.id)}
                    >
                      <Power className="h-3 w-3 mr-1" /> {g.active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => remove(g.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-1.5">
      <div className="uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold text-xs mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
