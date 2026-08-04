import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type Store,
  type Task,
  type TaskPriority,
} from "@/lib/time-store";
import {
  dateLabel,
  fmtMinutes,
  shiftISO,
  taskColor,
  taskMinutes,
  todayISO,
} from "@/lib/task-utils";

export interface TaskRowActions {
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onPriority: (p: TaskPriority) => void;
  onReschedule: (iso?: string) => void;
}

export function TaskRow({
  task,
  store,
  isTrash,
  selectMode,
  selected,
  onSelectChange,
  actions,
}: {
  task: Task;
  store: Store;
  isTrash?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onSelectChange?: (v: boolean) => void;
  actions: TaskRowActions;
}) {
  const done = task.status === "completed";
  const pri = TASK_PRIORITY_META[task.priority];
  const activity = task.activityId
    ? store.activities.find((a) => a.id === task.activityId)
    : null;
  const goals = (task.goalIds ?? [])
    .map((gid) => store.goals.find((g) => g.id === gid))
    .filter(Boolean);
  const overdue = !!task.dueDate && !done && task.dueDate < todayISO();

  return (
    <li
      draggable={!isTrash && !selectMode}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex items-start gap-3 px-3 py-3 sm:px-4 hover:bg-accent/30 transition animate-fade-in"
    >
      {selectMode ? (
        <button
          type="button"
          onClick={() => onSelectChange?.(!selected)}
          aria-label={selected ? "Deseleccionar" : "Seleccionar"}
          className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center transition ${
            selected ? "bg-primary border-primary" : "border-muted-foreground/40"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
        </button>
      ) : isTrash ? (
        <div className="h-6 w-6 rounded-md border border-dashed shrink-0" />
      ) : (
        <button
          type="button"
          onClick={actions.onToggle}
          aria-label={done ? "Desmarcar" : "Completar"}
          className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center transition active:scale-90 ${
            done
              ? "bg-foreground border-foreground"
              : "border-muted-foreground/40 hover:border-foreground"
          }`}
          style={!done ? { borderColor: `color-mix(in oklab, ${pri.color} 70%, transparent)` } : undefined}
        >
          {done && <Check className="h-4 w-4 text-background" />}
        </button>
      )}

      <button
        onClick={() => (selectMode ? onSelectChange?.(!selected) : actions.onEdit())}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: taskColor(task, store) }}
          />
          <span
            className={`text-sm truncate ${
              done ? "line-through text-muted-foreground" : "font-medium"
            }`}
          >
            {task.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 flex-wrap">
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{
              background: `color-mix(in oklab, ${pri.color} 15%, transparent)`,
              color: pri.color,
            }}
          >
            {pri.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {fmtMinutes(taskMinutes(task))}
          </span>
          {task.dueDate && (
            <span className={overdue ? "text-destructive font-medium" : ""}>
              {dateLabel(task.dueDate)}
              {task.dueTime ? ` · ${task.dueTime}` : ""}
            </span>
          )}
          {activity && (
            <span className="inline-flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: activity.color }}
              />
              {activity.name}
            </span>
          )}
          {goals.map((g) => (
            <span
              key={g!.id}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5"
              style={{
                background: `color-mix(in oklab, ${g!.color} 15%, transparent)`,
                borderColor: `color-mix(in oklab, ${g!.color} 40%, transparent)`,
              }}
            >
              {g!.icon ?? "🎯"} {g!.name}
            </span>
          ))}
          {(task.tags ?? []).map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5">
              #{tag}
            </span>
          ))}
          {task.status === "in_progress" && (
            <span className="rounded-full bg-muted px-1.5 py-0.5">
              {TASK_STATUS_META.in_progress.label}
            </span>
          )}
        </div>
      </button>

      {!selectMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Acciones de la tarea"
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {isTrash ? (
              <>
                <DropdownMenuItem onClick={actions.onRestore}>
                  <ArchiveRestore className="h-4 w-4" /> Restaurar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={actions.onPurge}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar definitivamente
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={actions.onEdit}>
                  <Pencil className="h-4 w-4" /> Editar
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarClock className="h-4 w-4" /> Reprogramar
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => actions.onReschedule(todayISO())}>
                      Hoy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => actions.onReschedule(shiftISO(todayISO(), 1))}
                    >
                      Mañana
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => actions.onReschedule(shiftISO(todayISO(), 7))}
                    >
                      En una semana
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => actions.onReschedule(undefined)}>
                      Quitar fecha
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: pri.color }}
                    />
                    Prioridad
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => (
                      <DropdownMenuItem key={p} onClick={() => actions.onPriority(p)}>
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: TASK_PRIORITY_META[p].color }}
                        />
                        {TASK_PRIORITY_META[p].label}
                        {task.priority === p && <Check className="h-3.5 w-3.5 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={actions.onDuplicate}>
                  <Copy className="h-4 w-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions.onArchive}>
                  {task.archived ? (
                    <>
                      <ArchiveRestore className="h-4 w-4" /> Desarchivar
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" /> Archivar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
                  Se puede deshacer
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={actions.onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
