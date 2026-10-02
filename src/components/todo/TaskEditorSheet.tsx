import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
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
  type TaskRepeat,
  type TaskStatus,
  uid,
} from "@/lib/time-store";
import { REPEAT_OPTIONS } from "@/lib/recurrence";
import { fmtMinutes, moveSubtask, shiftISO, statusFromSubtasks, todayISO } from "@/lib/task-utils";

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
  const activityLinked = t.activityId ? store.activities.find((a) => a.id === t.activityId) : null;

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
    if (!validate()) return;
    const subtasks = (t.subtasks ?? [])
      .map((st) => ({ ...st, name: st.name.trim() }))
      .filter((st) => st.name);
    // Only checklist changes drive the status, so a manual status pick still wins.
    const doneKey = (list: typeof subtasks) => list.map((st) => `${st.id}:${st.done}`).join("|");
    const checklistChanged = doneKey(subtasks) !== doneKey(initial.subtasks ?? []);
    onSubmit({
      ...t,
      status: checklistChanged ? statusFromSubtasks(t.status, subtasks) : t.status,
      subtasks: subtasks.length ? subtasks : undefined,
    });
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

        <SubtaskEditor value={t.subtasks ?? []} onChange={(v) => set("subtasks", v)} />

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
                      ? {
                          background: meta.color,
                          borderColor: meta.color,
                          color: "var(--background)",
                        }
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
              value={t.estimatedMinutes ?? ""}
              onChange={(e) =>
                // Allow an empty field while typing; saving validates ≥ 1 min.
                set(
                  "estimatedMinutes",
                  e.target.value === ""
                    ? undefined
                    : Math.max(0, Math.round(Number(e.target.value))),
                )
              }
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
                  t.estimatedMinutes === m
                    ? "bg-foreground text-background border-foreground"
                    : "hover:bg-accent"
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
                  (t.dueDate ?? "") === o.v
                    ? "bg-foreground text-background border-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            {(
              [
                { key: "dueDate", label: "Día", type: "date" },
                { key: "startTime", label: "Hora de inicio", type: "time" },
                { key: "dueTime", label: "Hora límite", type: "time" },
              ] as const
            ).map((f) => (
              <div key={f.key} className="min-w-0">
                <label className="text-[11px] text-muted-foreground">{f.label}</label>
                <div className="flex gap-1.5">
                  <Input
                    type={f.type}
                    value={t[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value || undefined)}
                    className="h-10 text-sm flex-1 min-w-0"
                    aria-label={f.label}
                    aria-invalid={f.key === "dueTime" ? !!errors.dueTime : undefined}
                  />
                  {t[f.key] && (
                    // iOS date/time pickers have no "clear" button.
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => set(f.key, undefined)}
                      aria-label={`Quitar ${f.label.toLowerCase()}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {errors.dueTime && <p className="text-[11px] text-destructive mt-1">{errors.dueTime}</p>}
          <div className="mt-2">
            <label className="text-[11px] text-muted-foreground">Repetir</label>
            <Select
              value={t.repeat ?? "none"}
              onValueChange={(v) => {
                const repeat = v === "none" ? undefined : (v as TaskRepeat);
                setT((cur) => ({
                  ...cur,
                  repeat,
                  // A new rule starts a fresh cycle; repeating needs a starting day.
                  repeatDone: undefined,
                  dueDate: repeat && !cur.dueDate ? todayISO() : cur.dueDate,
                }));
              }}
            >
              <SelectTrigger className="h-10 text-sm" aria-label="Repetir">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {t.repeat && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Al completarla se crea la próxima automáticamente.
              </p>
            )}
          </div>
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

      <div className="border-t p-4 flex items-center gap-2 bg-background/95 sticky bottom-0">
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

function SubtaskEditor({
  value,
  onChange,
}: {
  value: NonNullable<Task["subtasks"]>;
  onChange: (v: NonNullable<Task["subtasks"]>) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = value.filter((st) => st.done).length;
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...value, { id: uid(), name, done: false }]);
    setDraft("");
  };
  const patch = (id: string, p: Partial<(typeof value)[number]>) =>
    onChange(value.map((st) => (st.id === id ? { ...st, ...p } : st)));

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        Subtareas
        {value.length > 0 && (
          <span className="ml-1.5 tabular-nums">
            · {done}/{value.length}
          </span>
        )}
      </label>
      {value.length > 0 && (
        <ul className="mt-1 space-y-1">
          {value.map((st, i) => (
            <li key={st.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => patch(st.id, { done: !st.done })}
                aria-label={st.done ? "Desmarcar subtarea" : "Completar subtarea"}
                className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center transition ${
                  st.done ? "bg-foreground border-foreground" : "border-muted-foreground/40"
                }`}
              >
                {st.done && <Check className="h-3.5 w-3.5 text-background" />}
              </button>
              <Input
                value={st.name}
                onChange={(e) => patch(st.id, { name: e.target.value })}
                className={`h-9 text-sm flex-1 min-w-0 ${st.done ? "line-through text-muted-foreground" : ""}`}
                aria-label="Nombre de la subtarea"
              />
              {value.length > 1 && (
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => onChange(moveSubtask(value, i, -1))}
                    disabled={i === 0}
                    aria-label="Subir subtarea"
                    className="h-[18px] w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-25"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveSubtask(value, i, 1))}
                    disabled={i === value.length - 1}
                    aria-label="Bajar subtarea"
                    className="h-[18px] w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-25"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => onChange(value.filter((x) => x.id !== st.id))}
                aria-label="Quitar subtarea"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Agregar subtarea…"
          className="h-9 text-sm flex-1 min-w-0"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={add}
          disabled={!draft.trim()}
          aria-label="Agregar subtarea"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
