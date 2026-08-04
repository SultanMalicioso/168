import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CATEGORIES,
  TASK_PRIORITY_META,
  type Store,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/time-store";
import { fmtMinutes, shiftISO, todayISO } from "@/lib/task-utils";

export function TaskEditorSheet({
  open,
  task,
  store,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  task: Task | null;
  store: Store;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete?: (t: Task) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[92dvh] w-full rounded-t-3xl flex flex-col p-0"
            : "sm:max-w-md w-full flex flex-col p-0"
        }
      >
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="font-display text-xl">
            {task?.id ? "Editar tarea" : "Nueva tarea"}
          </SheetTitle>
        </SheetHeader>
        {task && (
          <EditorForm
            key={task.id || `new-${task.createdAt}`}
            initial={task}
            store={store}
            onCancel={onClose}
            onSubmit={onSave}
            onDelete={task.id && onDelete ? () => onDelete(task) : undefined}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditorForm({
  initial,
  store,
  onCancel,
  onSubmit,
  onDelete,
}: {
  initial: Task;
  store: Store;
  onCancel: () => void;
  onSubmit: (t: Task) => void;
  onDelete?: () => void;
}) {
  const [t, setT] = useState<Task>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((p) => ({ ...p, [k]: v }));
  const activityLinked = t.activityId
    ? store.activities.find((a) => a.id === t.activityId)
    : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!t.name.trim()) e.name = "Poné un nombre a la tarea";
    if (!t.estimatedMinutes || t.estimatedMinutes < 1)
      e.estimatedMinutes = "La duración debe ser al menos 1 minuto";
    if (t.startTime && t.dueTime && t.dueTime < t.startTime)
      e.dueTime = "La hora límite es anterior al inicio";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (validate()) onSubmit(t);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input
            autoFocus
            value={t.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Estudiar Biología…"
            className="mt-1"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-[11px] text-destructive mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Descripción</label>
          <Textarea
            value={t.description ?? ""}
            onChange={(e) => set("description", e.target.value || undefined)}
            rows={2}
            className="mt-1 text-sm"
            placeholder="Detalles…"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Prioridad</label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => {
              const active = t.priority === p;
              const meta = TASK_PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("priority", p)}
                  className="text-xs py-2 rounded-xl border transition"
                  style={
                    active
                      ? { background: meta.color, borderColor: meta.color, color: "var(--background)" }
                      : {
                          background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
                          borderColor: `color-mix(in oklab, ${meta.color} 35%, transparent)`,
                        }
                  }
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            Duración estimada <span className="text-destructive">*</span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={5}
              value={t.estimatedMinutes ?? 30}
              onChange={(e) => set("estimatedMinutes", Math.max(1, Number(e.target.value) || 1))}
              className="h-10 text-sm w-24"
              aria-invalid={!!errors.estimatedMinutes}
            />
            <span className="text-xs text-muted-foreground">
              min · {fmtMinutes(Math.max(1, t.estimatedMinutes ?? 30))}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("estimatedMinutes", m)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  t.estimatedMinutes === m ? "bg-foreground text-background border-foreground" : "hover:bg-accent"
                }`}
              >
                {fmtMinutes(m)}
              </button>
            ))}
          </div>
          {errors.estimatedMinutes && (
            <p className="text-[11px] text-destructive mt-1">{errors.estimatedMinutes}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5">
            La duración alimenta los círculos en modo Tareas y Combinado.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Fecha</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[
              { l: "Hoy", v: todayISO() },
              { l: "Mañana", v: shiftISO(todayISO(), 1) },
              { l: "En 7 días", v: shiftISO(todayISO(), 7) },
              { l: "Sin fecha", v: "" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => set("dueDate", o.v || undefined)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  (t.dueDate ?? "") === o.v ? "bg-foreground text-background border-foreground" : "hover:bg-accent"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Input
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e) => set("dueDate", e.target.value || undefined)}
              className="h-10 text-sm"
            />
            <Input
              type="time"
              value={t.startTime ?? ""}
              onChange={(e) => set("startTime", e.target.value || undefined)}
              className="h-10 text-sm"
              aria-label="Hora de inicio"
            />
            <Input
              type="time"
              value={t.dueTime ?? ""}
              onChange={(e) => set("dueTime", e.target.value || undefined)}
              className="h-10 text-sm"
              aria-label="Hora límite"
              aria-invalid={!!errors.dueTime}
            />
          </div>
          {errors.dueTime && <p className="text-[11px] text-destructive mt-1">{errors.dueTime}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Actividad</label>
            <Select
              value={t.activityId ?? "__none__"}
              onValueChange={(v) => set("activityId", v === "__none__" ? undefined : v)}
            >
              <SelectTrigger className="h-10 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin actividad</SelectItem>
                {store.activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categoría</label>
            <Select
              value={t.category ?? activityLinked?.category ?? "otro"}
              onValueChange={(v) => set("category", v as Task["category"])}
            >
              <SelectTrigger className="h-10 mt-1 text-sm">
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
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Objetivos</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {store.goals.length === 0 && (
              <span className="text-xs text-muted-foreground">No hay objetivos definidos.</span>
            )}
            {store.goals.map((g) => {
              const selected = (t.goalIds ?? []).includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    set(
                      "goalIds",
                      selected
                        ? (t.goalIds ?? []).filter((x) => x !== g.id)
                        : [...(t.goalIds ?? []), g.id],
                    )
                  }
                  className="text-xs px-2.5 py-1 rounded-full border transition"
                  style={
                    selected
                      ? { background: g.color, borderColor: g.color, color: "var(--background)" }
                      : {
                          background: `color-mix(in oklab, ${g.color} 10%, transparent)`,
                          borderColor: `color-mix(in oklab, ${g.color} 40%, transparent)`,
                        }
                  }
                >
                  {g.icon ?? "🎯"} {g.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={t.status} onValueChange={(v) => set("status", v as TaskStatus)}>
              <SelectTrigger className="h-10 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Etiquetas</label>
            <Input
              value={(t.tags ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              placeholder="examen, casa"
              className="mt-1 text-sm h-10"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Notas</label>
          <Textarea
            value={t.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || undefined)}
            rows={2}
            className="mt-1 text-sm"
          />
        </div>
      </div>

      <div className="border-t p-4 flex items-center gap-2 bg-background/95 backdrop-blur sticky bottom-0">
        {onDelete && (
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar tarea">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} className="ml-auto">
          <X className="h-4 w-4 mr-1" /> Cancelar
        </Button>
        <Button onClick={submit}>
          <Check className="h-4 w-4 mr-1" /> Guardar
        </Button>
      </div>
    </>
  );
}
