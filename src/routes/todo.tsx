import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Flag,
  Inbox,
  ListTodo,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  CATEGORIES,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  useTimeStore,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/time-store";
import {
  allTasks,
  allTasksWithTrash,
  createTask,
  dailyStreak,
  duplicateTask,
  groupByGoal,
  groupByPriority,
  purgeAllTrashed,
  purgeTask,
  restoreTask,
  sortTasks,
  taskColor,
  taskMinutes,
  taskStats,
  tasksArchived,
  tasksCompleted,
  tasksOverdue,
  tasksToday,
  tasksTrashed,
  tasksUnassigned,
  tasksUpcoming,
  todayISO,
  trashTask,
  updateTask,
  weeklyStreak,
} from "@/lib/task-utils";

export const Route = createFileRoute("/todo")({
  head: () => ({
    meta: [
      { title: "To-Do · 168 · Gestión profesional de tareas" },
      {
        name: "description",
        content:
          "Módulo To-Do integrado con actividades, objetivos y calendario: prioridades, duración estimada, filtros avanzados y sincronización con los círculos de 168h.",
      },
      { property: "og:title", content: "To-Do · 168 · Gestión profesional de tareas" },
      {
        property: "og:description",
        content:
          "Sistema completo de tareas con prioridades, duración, drag & drop, papelera y estadísticas — totalmente integrado con las actividades.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TodoPage,
});

type View =
  | "today"
  | "upcoming"
  | "overdue"
  | "completed"
  | "unassigned"
  | "by_priority"
  | "by_goal"
  | "archived"
  | "trash"
  | "all";

type SortBy = "priority" | "date" | "duration" | "name" | "created";

function TodoPage() {
  const { store, setStore, hydrated } = useTimeStore();
  const [view, setView] = useState<View>("today");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [editing, setEditing] = useState<Task | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const toggleTheme = () =>
    setStore({ ...store, theme: store.theme === "dark" ? "light" : "dark" });

  const openNew = (preset?: Partial<Task>) => {
    setEditing({
      id: "",
      name: "",
      status: "pending",
      priority: "medium",
      estimatedMinutes: 30,
      createdAt: Date.now(),
      ...preset,
    });
    setOpenEditor(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setOpenEditor(true);
  };

  const saveTask = (t: Task) => {
    if (!t.name.trim()) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    if (!t.estimatedMinutes || t.estimatedMinutes < 1) {
      toast.error("La duración debe ser mayor a 0");
      return;
    }
    if (t.startTime && t.dueTime && t.dueTime < t.startTime) {
      toast.error("La hora límite es anterior a la hora de inicio");
      return;
    }
    if (t.id) {
      setStore(updateTask(store, t.id, t));
      toast.success("Tarea actualizada");
    } else {
      setStore(createTask(store, t));
      toast.success("Tarea creada");
    }
    setOpenEditor(false);
    setEditing(null);
  };

  const quickToggleStatus = (t: Task) => {
    const next: TaskStatus = t.status === "completed" ? "pending" : "completed";
    setStore(updateTask(store, t.id, { status: next }));
  };

  const quickPriority = (t: Task, p: TaskPriority) =>
    setStore(updateTask(store, t.id, { priority: p }));

  const remove = (t: Task) => {
    setStore(trashTask(store, t.id));
    toast.success("Tarea enviada a papelera", {
      action: {
        label: "Deshacer",
        onClick: () => setStore(restoreTask(store, t.id)),
      },
    });
  };
  const restore = (t: Task) => setStore(restoreTask(store, t.id));
  const dup = (t: Task) => {
    setStore(duplicateTask(store, t.id));
    toast.success("Tarea duplicada");
  };
  const purge = (t: Task) => setStore(purgeTask(store, t.id));
  const toggleArchive = (t: Task) =>
    setStore(updateTask(store, t.id, { archived: !t.archived }));

  // Derived: base list per view
  const baseList = useMemo<Task[]>(() => {
    switch (view) {
      case "today":
        return tasksToday(store);
      case "upcoming":
        return tasksUpcoming(store);
      case "overdue":
        return tasksOverdue(store);
      case "completed":
        return tasksCompleted(store);
      case "unassigned":
        return tasksUnassigned(store);
      case "archived":
        return tasksArchived(store);
      case "trash":
        return tasksTrashed(store);
      case "by_priority":
      case "by_goal":
      case "all":
      default:
        return allTasks(store).filter((t) => !t.archived);
    }
  }, [store, view]);

  // Search + sort
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? baseList.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.description ?? "").toLowerCase().includes(q) ||
            (t.tags ?? []).some((x) => x.toLowerCase().includes(q)),
        )
      : baseList;
    return sortTasks(filtered, sortBy);
  }, [baseList, query, sortBy]);

  // Global stats (all non-trashed)
  const gStats = useMemo(() => {
    const all = allTasks(store);
    return {
      ...taskStats(all),
      streakDay: dailyStreak(all),
      streakWeek: weeklyStreak(all),
    };
  }, [store]);

  // Today productivity: done_min / planned_min for today
  const todayProd = useMemo(() => {
    const t = tasksToday(store);
    const s = taskStats(t);
    return { ...s, score: s.plannedMin > 0 ? (s.doneMin / s.plannedMin) * 100 : 0 };
  }, [store]);

  // Counts per view for sidebar
  const counts = useMemo(
    () => ({
      today: tasksToday(store).length,
      upcoming: tasksUpcoming(store).length,
      overdue: tasksOverdue(store).length,
      completed: tasksCompleted(store).length,
      unassigned: tasksUnassigned(store).length,
      archived: tasksArchived(store).length,
      trash: tasksTrashed(store).length,
      all: allTasks(store).filter((t) => !t.archived).length,
    }),
    [store],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/80 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" /> 168
          </Link>
          <div className="hidden md:flex items-center gap-2 pl-3 border-l">
            <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-lg leading-none">To-Do</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Tareas · duración · integración total
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="h-9 pl-8 w-40 md:w-64 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => openNew()} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nueva
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
              {store.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-1 lg:sticky lg:top-20 lg:self-start">
          <SidebarBtn active={view === "today"} onClick={() => setView("today")} icon={<CalendarIcon className="h-3.5 w-3.5" />} label="Hoy" count={counts.today} />
          <SidebarBtn active={view === "upcoming"} onClick={() => setView("upcoming")} icon={<Clock className="h-3.5 w-3.5" />} label="Próximas" count={counts.upcoming} />
          <SidebarBtn active={view === "overdue"} onClick={() => setView("overdue")} icon={<Flag className="h-3.5 w-3.5" />} label="Atrasadas" count={counts.overdue} accent="destructive" />
          <SidebarBtn active={view === "all"} onClick={() => setView("all")} icon={<ListTodo className="h-3.5 w-3.5" />} label="Todas" count={counts.all} />
          <SidebarBtn active={view === "unassigned"} onClick={() => setView("unassigned")} icon={<Inbox className="h-3.5 w-3.5" />} label="Sin actividad" count={counts.unassigned} />
          <SidebarBtn active={view === "completed"} onClick={() => setView("completed")} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completadas" count={counts.completed} />

          <div className="pt-3 pb-1 px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Agrupaciones
          </div>
          <SidebarBtn active={view === "by_priority"} onClick={() => setView("by_priority")} icon={<Flag className="h-3.5 w-3.5" />} label="Por prioridad" />
          <SidebarBtn active={view === "by_goal"} onClick={() => setView("by_goal")} icon={<Target className="h-3.5 w-3.5" />} label="Por objetivo" />

          <div className="pt-3 pb-1 px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Sistema
          </div>
          <SidebarBtn active={view === "archived"} onClick={() => setView("archived")} icon={<Archive className="h-3.5 w-3.5" />} label="Archivadas" count={counts.archived} />
          <SidebarBtn active={view === "trash"} onClick={() => setView("trash")} icon={<Trash2 className="h-3.5 w-3.5" />} label="Papelera" count={counts.trash} />
        </aside>

        {/* Main */}
        <section className="space-y-6 min-w-0">
          {/* Stats panel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total" value={String(gStats.total)} sub={`${gStats.pending} pendientes`} />
            <Stat label="Completadas" value={`${gStats.pct.toFixed(0)}%`} sub={`${gStats.done} de ${gStats.total}`} />
            <Stat label="Horas plan." value={fmtMin(gStats.plannedMin)} sub={`${fmtMin(gStats.doneMin)} hechas`} />
            <Stat label="Productividad hoy" value={`${todayProd.score.toFixed(0)}%`} sub={`${fmtMin(todayProd.doneMin)} / ${fmtMin(todayProd.plannedMin)}`} />
            <Stat label="Racha diaria" value={`${gStats.streakDay}d`} sub="con al menos 1 tarea" />
            <Stat label="Racha semanal" value={`${gStats.streakWeek}w`} sub="semanas activas" />
            <Stat label="En progreso" value={String(gStats.inProg)} sub="activas ahora" />
            <Stat label="Pendientes" value={String(gStats.pending)} sub="por hacer" />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl capitalize">{viewLabel(view)}</h2>
            <span className="text-xs text-muted-foreground">· {list.length} tareas</span>
            <div className="ml-auto flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Ordenar: fecha</SelectItem>
                  <SelectItem value="priority">Ordenar: prioridad</SelectItem>
                  <SelectItem value="duration">Ordenar: duración</SelectItem>
                  <SelectItem value="name">Ordenar: nombre</SelectItem>
                  <SelectItem value="created">Ordenar: creación</SelectItem>
                </SelectContent>
              </Select>
              {view === "trash" && counts.trash > 0 && (
                <Button size="sm" variant="outline" onClick={() => setConfirmPurge(true)} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Vaciar
                </Button>
              )}
            </div>
          </div>

          {/* Quick composer */}
          {view !== "trash" && view !== "completed" && view !== "archived" && (
            <QuickComposer
              onCreate={(name) => {
                const preset: Partial<Task> = {
                  name,
                  estimatedMinutes: 30,
                  priority: "medium",
                  status: "pending",
                };
                if (view === "today") preset.dueDate = todayISO();
                setStore(createTask(store, preset));
              }}
            />
          )}

          {/* List */}
          <div className="rounded-3xl border bg-card shadow-[var(--shadow-soft)]">
            <ScrollArea className="max-h-[70vh]">
              {list.length === 0 ? (
                <EmptyState view={view} onCreate={() => openNew()} />
              ) : view === "by_priority" ? (
                <div className="divide-y">
                  {(Object.entries(groupByPriority(list)) as [TaskPriority, Task[]][])
                    .filter(([, arr]) => arr.length > 0)
                    .sort(
                      ([a], [b]) =>
                        TASK_PRIORITY_META[b].weight - TASK_PRIORITY_META[a].weight,
                    )
                    .map(([pri, arr]) => (
                      <GroupSection
                        key={pri}
                        color={TASK_PRIORITY_META[pri].color}
                        title={TASK_PRIORITY_META[pri].label}
                        count={arr.length}
                      >
                        {arr.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            store={store}
                            onToggle={() => quickToggleStatus(t)}
                            onEdit={() => openEdit(t)}
                            onDelete={() => remove(t)}
                            onRestore={() => restore(t)}
                            onPurge={() => purge(t)}
                            onDuplicate={() => dup(t)}
                            onArchive={() => toggleArchive(t)}
                            onPriority={(p) => quickPriority(t, p)}
                            isTrash={view === "trash"}
                          />
                        ))}
                      </GroupSection>
                    ))}
                </div>
              ) : view === "by_goal" ? (
                <div className="divide-y">
                  {groupByGoal(list, store.goals).map(({ goal, tasks }) => (
                    <GroupSection
                      key={goal?.id ?? "none"}
                      color={goal?.color ?? "var(--muted-foreground)"}
                      title={goal ? `${goal.icon ?? "🎯"} ${goal.name}` : "Sin objetivo"}
                      count={tasks.length}
                    >
                      {tasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          store={store}
                          onToggle={() => quickToggleStatus(t)}
                          onEdit={() => openEdit(t)}
                          onDelete={() => remove(t)}
                          onRestore={() => restore(t)}
                          onPurge={() => purge(t)}
                          onDuplicate={() => dup(t)}
                          onArchive={() => toggleArchive(t)}
                          onPriority={(p) => quickPriority(t, p)}
                          isTrash={view === "trash"}
                        />
                      ))}
                    </GroupSection>
                  ))}
                </div>
              ) : (
                <ul className="divide-y">
                  {list.map((t) => (
                    <li key={t.id}>
                      <TaskRow
                        task={t}
                        store={store}
                        onToggle={() => quickToggleStatus(t)}
                        onEdit={() => openEdit(t)}
                        onDelete={() => remove(t)}
                        onRestore={() => restore(t)}
                        onPurge={() => purge(t)}
                        onDuplicate={() => dup(t)}
                        onArchive={() => toggleArchive(t)}
                        onPriority={(p) => quickPriority(t, p)}
                        isTrash={view === "trash"}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Week strip: drag tasks between days */}
          <WeekStrip
            store={store}
            onDrop={(taskId, dueDate) =>
              setStore(updateTask(store, taskId, { dueDate }))
            }
            onOpen={(t) => openEdit(t)}
          />
        </section>
      </main>

      {/* Editor */}
      <TaskEditor
        open={openEditor}
        task={editing}
        store={store}
        onClose={() => {
          setOpenEditor(false);
          setEditing(null);
        }}
        onSave={saveTask}
      />

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar la papelera?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente {counts.trash} tareas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStore(purgeAllTrashed(store));
                setConfirmPurge(false);
                toast.success("Papelera vacía");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Vaciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function SidebarBtn({
  active,
  onClick,
  icon,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  accent?: "destructive";
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
        active
          ? "bg-foreground text-background"
          : "hover:bg-accent text-foreground"
      }`}
    >
      <span
        className={
          active
            ? "text-background/80"
            : accent === "destructive" && count && count > 0
              ? "text-destructive"
              : "text-muted-foreground"
        }
      >
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
            active
              ? "bg-background/20 text-background"
              : accent === "destructive"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-xl mt-1 leading-none truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}

function QuickComposer({ onCreate }: { onCreate: (name: string) => void }) {
  const [v, setV] = useState("");
  const submit = () => {
    const n = v.trim();
    if (!n) return;
    onCreate(n);
    setV("");
  };
  return (
    <div className="flex gap-2">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Añadir tarea rápida… (Enter para crear)"
        className="h-10 text-sm"
      />
      <Button onClick={submit} disabled={!v.trim()} className="gap-1.5">
        <Plus className="h-4 w-4" /> Añadir
      </Button>
    </div>
  );
}

function GroupSection({
  title,
  color,
  count,
  children,
}: {
  title: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-muted/30 hover:bg-muted/50 transition"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span>{title}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums ml-1">{count}</span>
        <ChevronDown className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <ul className="divide-y">{children}</ul>}
    </div>
  );
}

function TaskRow({
  task,
  store,
  onToggle,
  onEdit,
  onDelete,
  onRestore,
  onPurge,
  onDuplicate,
  onArchive,
  onPriority,
  isTrash,
}: {
  task: Task;
  store: ReturnType<typeof useTimeStore>["store"];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onPriority: (p: TaskPriority) => void;
  isTrash: boolean;
}) {
  const done = task.status === "completed";
  const pri = TASK_PRIORITY_META[task.priority];
  const activity = task.activityId
    ? store.activities.find((a) => a.id === task.activityId)
    : null;
  const goals = (task.goalIds ?? [])
    .map((gid) => store.goals.find((g) => g.id === gid))
    .filter(Boolean);
  const overdue =
    !!task.dueDate && task.status !== "completed" && task.dueDate < todayISO();

  return (
    <li
      draggable={!isTrash}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-start gap-2 p-3 hover:bg-accent/30 transition"
    >
      {isTrash ? (
        <div className="h-5 w-5 rounded-md border border-dashed shrink-0" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? "Desmarcar" : "Completar"}
          className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition mt-0.5 ${
            done ? "bg-foreground border-foreground" : "border-muted-foreground/40 hover:border-foreground"
          }`}
        >
          {done && <Check className="h-3 w-3 text-background" />}
        </button>
      )}

      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: taskColor(task, store) }}
          />
          <span className={`text-sm truncate ${done ? "line-through text-muted-foreground" : "font-medium"}`}>
            {task.name}
          </span>
          {overdue && (
            <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
              atrasada
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pri.color }} />
            {pri.label}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> {fmtMin(taskMinutes(task))}
          </span>
          {task.dueDate && (
            <>
              <span>·</span>
              <span>
                {task.dueDate}
                {task.dueTime ? ` ${task.dueTime}` : ""}
              </span>
            </>
          )}
          {activity && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: activity.color }} />
                {activity.name}
              </span>
            </>
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
          {task.status !== "pending" && task.status !== "completed" && (
            <>
              <span>·</span>
              <span>{TASK_STATUS_META[task.status].label}</span>
            </>
          )}
        </div>
      </button>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        {!isTrash && (
          <>
            <PrioMenu current={task.priority} onPick={onPriority} />
            <IconBtn onClick={onDuplicate} label="Duplicar">
              <Copy className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={onArchive} label={task.archived ? "Desarchivar" : "Archivar"}>
              {task.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn onClick={onEdit} label="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={onDelete} label="Eliminar" danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </>
        )}
        {isTrash && (
          <>
            <IconBtn onClick={onRestore} label="Restaurar">
              <ArchiveRestore className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={onPurge} label="Eliminar definitivamente" danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </>
        )}
      </div>
    </li>
  );
}

function PrioMenu({
  current,
  onPick,
}: {
  current: TaskPriority;
  onPick: (p: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Cambiar prioridad"
        title="Prioridad"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Flag className="h-3.5 w-3.5" style={{ color: TASK_PRIORITY_META[current].color }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border bg-popover shadow-md py-1 min-w-[130px]">
            {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: TASK_PRIORITY_META[p].color }}
                />
                {TASK_PRIORITY_META[p].label}
                {current === p && <Check className="h-3 w-3 ml-auto" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconBtn({
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
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition ${
        danger
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ view, onCreate }: { view: View; onCreate: () => void }) {
  const messages: Record<View, string> = {
    today: "No tenés tareas para hoy. ¡Buen momento para planificar!",
    upcoming: "No hay tareas próximas.",
    overdue: "No hay tareas atrasadas. ¡Al día!",
    completed: "Aún no completaste ninguna tarea.",
    unassigned: "Todas tus tareas tienen actividad asignada.",
    archived: "No hay tareas archivadas.",
    trash: "La papelera está vacía.",
    by_priority: "No hay tareas.",
    by_goal: "No hay tareas.",
    all: "No hay tareas todavía.",
  };
  return (
    <div className="p-10 text-center">
      <p className="text-sm text-muted-foreground">{messages[view]}</p>
      {view !== "trash" && view !== "archived" && view !== "completed" && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear tarea
        </Button>
      )}
    </div>
  );
}

/* --- Week strip: drag & drop tasks between days --- */
function WeekStrip({
  store,
  onDrop,
  onOpen,
}: {
  store: ReturnType<typeof useTimeStore>["store"];
  onDrop: (taskId: string, dueDate: string) => void;
  onOpen: (t: Task) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const today = new Date();
  const monday = new Date(today);
  const dow = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - dow);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const all = allTasks(store);

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg">Esta semana</h3>
        <span className="text-xs text-muted-foreground">Arrastrá tareas entre días</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const iso = todayISO(d);
          const dayTasks = all.filter((t) => t.dueDate === iso);
          const isToday = iso === todayISO();
          const isOver = over === iso;
          const totalMin = dayTasks.reduce((s, t) => s + taskMinutes(t), 0);
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
              className={`rounded-xl border p-2 min-h-[110px] transition ${
                isOver
                  ? "border-foreground ring-2 ring-foreground/20 bg-accent/30"
                  : isToday
                    ? "border-foreground/40"
                    : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-medium">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][(d.getDay() + 6) % 7]}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {d.getDate()}
                </div>
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                    }}
                    onClick={() => onOpen(t)}
                    className={`w-full text-left text-[10px] px-1.5 py-1 rounded-md truncate cursor-grab active:cursor-grabbing ${
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
                  <div className="text-[10px] text-muted-foreground/60 italic px-1">
                    —
                  </div>
                )}
              </div>
              {totalMin > 0 && (
                <div className="mt-1.5 text-[9px] text-muted-foreground tabular-nums text-right">
                  {fmtMin(totalMin)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --- Full editor Sheet --- */
function TaskEditor({
  open,
  task,
  store,
  onClose,
  onSave,
}: {
  open: boolean;
  task: Task | null;
  store: ReturnType<typeof useTimeStore>["store"];
  onClose: () => void;
  onSave: (t: Task) => void;
}) {
  const [draft, setDraft] = useState<Task | null>(task);
  // Sync when task changes
  if (task && (!draft || draft.id !== task.id || (!task.id && !draft))) {
    // pattern only runs once per new prop; safe here since parent re-mounts by key changes
  }
  // Use uncontrolled sync via key on Sheet content
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="sm:max-w-md w-full flex flex-col p-0">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="font-display text-xl">
            {task?.id ? "Editar tarea" : "Nueva tarea"}
          </SheetTitle>
        </SheetHeader>
        {task && (
          <EditorForm
            key={task.id || "new"}
            initial={task}
            store={store}
            onCancel={onClose}
            onSubmit={onSave}
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
}: {
  initial: Task;
  store: ReturnType<typeof useTimeStore>["store"];
  onCancel: () => void;
  onSubmit: (t: Task) => void;
}) {
  const [t, setT] = useState<Task>(initial);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((p) => ({ ...p, [k]: v }));

  const activityLinked = t.activityId
    ? store.activities.find((a) => a.id === t.activityId)
    : null;

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input
            autoFocus
            value={t.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Estudiar Biología…"
            className="mt-1"
          />
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Actividad</label>
            <Select
              value={t.activityId ?? "__none__"}
              onValueChange={(v) => set("activityId", v === "__none__" ? undefined : v)}
            >
              <SelectTrigger className="h-9 mt-1 text-sm">
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
              <SelectTrigger className="h-9 mt-1 text-sm">
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
                  className={`text-xs px-2 py-1 rounded-full border transition ${
                    selected ? "text-background" : "hover:bg-accent"
                  }`}
                  style={
                    selected
                      ? { background: g.color, borderColor: g.color }
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Prioridad</label>
            <Select value={t.priority} onValueChange={(v) => set("priority", v as TaskPriority)}>
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">🚨 Urgente</SelectItem>
                <SelectItem value="high">🔥 Alta</SelectItem>
                <SelectItem value="medium">◐ Media</SelectItem>
                <SelectItem value="low">◯ Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={t.status} onValueChange={(v) => set("status", v as TaskStatus)}>
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e) => set("dueDate", e.target.value || undefined)}
              className="h-9 mt-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Inicio</label>
            <Input
              type="time"
              value={t.startTime ?? ""}
              onChange={(e) => set("startTime", e.target.value || undefined)}
              className="h-9 mt-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Límite</label>
            <Input
              type="time"
              value={t.dueTime ?? ""}
              onChange={(e) => set("dueTime", e.target.value || undefined)}
              className="h-9 mt-1 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            Duración estimada <span className="text-destructive">*</span>
          </label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min={1}
              step={5}
              value={t.estimatedMinutes ?? 30}
              onChange={(e) =>
                set("estimatedMinutes", Math.max(1, Number(e.target.value) || 1))
              }
              className="h-9 text-sm w-28"
            />
            <span className="text-xs text-muted-foreground">min</span>
            <div className="ml-auto flex gap-1">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("estimatedMinutes", m)}
                  className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-accent"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            La duración afecta directamente los círculos en modo Tareas y Combinado.
          </p>
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
            placeholder="importante, urgente, casa"
            className="mt-1 text-sm h-9"
          />
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

      <div className="border-t p-4 flex items-center justify-end gap-2 bg-background/95 backdrop-blur">
        <Button variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancelar
        </Button>
        <Button onClick={() => onSubmit(t)}>
          <Check className="h-4 w-4 mr-1" /> Guardar
        </Button>
      </div>
    </>
  );
}

/* ---------- utils ---------- */

function fmtMin(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

function viewLabel(v: View) {
  switch (v) {
    case "today":
      return "Hoy";
    case "upcoming":
      return "Próximas";
    case "overdue":
      return "Atrasadas";
    case "completed":
      return "Completadas";
    case "unassigned":
      return "Sin actividad";
    case "by_priority":
      return "Por prioridad";
    case "by_goal":
      return "Por objetivo";
    case "archived":
      return "Archivadas";
    case "trash":
      return "Papelera";
    case "all":
      return "Todas";
  }
}
