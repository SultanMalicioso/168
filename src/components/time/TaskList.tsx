import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  ListTodo,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Task,
  TaskPriority,
  TaskStatus,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
} from "@/lib/time-store";

const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  accentColor?: string;
}

export function TaskList({ tasks, onChange, accentColor }: Props) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sorted = tasks; // preserve manual order (drag & drop)

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "completed").length;
    return { total, done, pct: total ? (done / total) * 100 : 0 };
  }, [tasks]);

  const addTask = (name: string) => {
    const n = name.trim();
    if (!n) return;
    const t: Task = {
      id: uid(),
      name: n,
      status: "pending",
      priority: "medium",
      createdAt: Date.now(),
    };
    onChange([...tasks, t]);
    setDraft("");
  };

  const update = (id: string, patch: Partial<Task>) => {
    onChange(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              completedAt:
                patch.status === "completed"
                  ? Date.now()
                  : patch.status && patch.status !== "completed"
                    ? undefined
                    : t.completedAt,
            }
          : t,
      ),
    );
  };

  const remove = (id: string) => onChange(tasks.filter((t) => t.id !== id));
  const duplicate = (t: Task) =>
    onChange([...tasks, { ...t, id: uid(), name: `${t.name} (copia)`, status: "pending", completedAt: undefined, createdAt: Date.now() }]);

  const toggle = (t: Task) =>
    update(t.id, { status: t.status === "completed" ? "pending" : "completed" });

  // Drag & drop
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverId(id);
  };
  const onDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!from || from === id) return;
    const arr = [...tasks];
    const fromIdx = arr.findIndex((t) => t.id === from);
    const toIdx = arr.findIndex((t) => t.id === id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    onChange(arr);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ListTodo className="h-3.5 w-3.5" /> Tareas
          {stats.total > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground tabular-nums ml-1">
              {stats.done}/{stats.total} · {stats.pct.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {stats.total > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${stats.pct}%`,
              background: accentColor ?? "var(--foreground)",
            }}
          />
        </div>
      )}

      <ul className="space-y-1">
        {sorted.map((t) => {
          const isOver = overId === t.id;
          const isOpen = expanded === t.id;
          const pri = TASK_PRIORITY_META[t.priority];
          const done = t.status === "completed";
          return (
            <li
              key={t.id}
              draggable
              onDragStart={onDragStart(t.id)}
              onDragOver={onDragOver(t.id)}
              onDrop={onDrop(t.id)}
              onDragEnd={() => {
                dragId.current = null;
                setOverId(null);
              }}
              className={`group rounded-lg border bg-background transition ${
                isOver ? "border-foreground/60 ring-1 ring-foreground/20" : "border-border"
              }`}
            >
              <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                <button
                  type="button"
                  className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground p-1"
                  aria-label="Arrastrar"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  aria-label={done ? "Desmarcar" : "Completar"}
                  className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition ${
                    done ? "bg-foreground border-foreground" : "border-muted-foreground/40 hover:border-foreground"
                  }`}
                >
                  {done && <Check className="h-3 w-3 text-background" />}
                </button>

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className={`text-sm truncate ${done ? "line-through text-muted-foreground" : ""}`}>
                    {t.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: pri.color }}
                    />
                    <span>{pri.label}</span>
                    {t.status !== "pending" && t.status !== "completed" && (
                      <span>· {TASK_STATUS_META[t.status].label}</span>
                    )}
                    {t.dueDate && (
                      <span>
                        · {t.dueDate}
                        {t.dueTime ? ` ${t.dueTime}` : ""}
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => duplicate(t)}
                    aria-label="Duplicar"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label="Eliminar"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : t.id)}
                    aria-label={isOpen ? "Cerrar" : "Detalles"}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t px-2 py-2 space-y-2 bg-muted/30">
                  <Input
                    value={t.name}
                    onChange={(e) => update(t.id, { name: e.target.value })}
                    placeholder="Nombre de la tarea"
                    className="h-8 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Estado</label>
                      <Select value={t.status} onValueChange={(v) => update(t.id, { status: v as TaskStatus })}>
                        <SelectTrigger className="h-8 text-xs">
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
                      <label className="text-[10px] text-muted-foreground">Prioridad</label>
                      <Select value={t.priority} onValueChange={(v) => update(t.id, { priority: v as TaskPriority })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baja</SelectItem>
                          <SelectItem value="medium">Media</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="urgent">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Fecha</label>
                      <Input
                        type="date"
                        value={t.dueDate ?? ""}
                        onChange={(e) => update(t.id, { dueDate: e.target.value || undefined })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Hora</label>
                      <Input
                        type="time"
                        value={t.dueTime ?? ""}
                        onChange={(e) => update(t.id, { dueTime: e.target.value || undefined })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Descripción</label>
                    <Textarea
                      value={t.description ?? ""}
                      onChange={(e) => update(t.id, { description: e.target.value || undefined })}
                      rows={2}
                      className="text-xs"
                      placeholder="Detalles adicionales…"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Notas</label>
                    <Textarea
                      value={t.notes ?? ""}
                      onChange={(e) => update(t.id, { notes: e.target.value || undefined })}
                      rows={1}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(null)}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" /> Cerrar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTask(draft);
            }
          }}
          placeholder="Nueva tarea… (Enter para agregar)"
          className="h-9 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addTask(draft)}
          disabled={!draft.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
