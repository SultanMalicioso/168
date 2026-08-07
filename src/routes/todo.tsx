import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flag,
  Inbox,
  ListTodo,
  Moon,
  Plus,
  Search,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TimerBar } from "@/components/time/TimerBar";
import {
  TASK_PRIORITY_META,
  useTimeStore,
  type Store,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/time-store";
import {
  allTags,
  allTasks,
  createTask,
  dailyStreak,
  dateLabel,
  duplicateTask,
  fmtMinutes,
  groupByActivity,
  groupByDate,
  groupByGoal,
  groupByPriority,
  purgeAllTrashed,
  purgeTask,
  restoreTask,
  sortTasks,
  taskStats,
  tasksArchived,
  tasksCompleted,
  tasksNoDate,
  tasksOverdue,
  tasksToday,
  tasksTrashed,
  tasksUnassigned,
  tasksUpcoming,
  todayISO,
  trashManyTasks,
  trashTask,
  updateManyTasks,
  updateTask,
  weeklyStreak,
} from "@/lib/task-utils";
import type { ParsedTask } from "@/lib/task-parse";
import { emptyTaskDraft } from "@/lib/task-parse";
import { TaskRow } from "@/components/todo/TaskRow";
import { QuickAdd } from "@/components/todo/QuickAdd";
import { TaskEditorSheet } from "@/components/todo/TaskEditorSheet";
import { WeekStrip } from "@/components/todo/WeekStrip";

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
  | "nodate"
  | "all"
  | "unassigned"
  | "completed"
  | "archived"
  | "trash";

type SortBy = "priority" | "date" | "duration" | "name" | "created";
type GroupBy = "none" | "activity" | "priority" | "goal" | "date";

const VIEW_META: { id: View; label: string; icon: React.ReactNode; accent?: boolean }[] = [
  { id: "today", label: "Hoy", icon: <CalendarCheck className="h-3.5 w-3.5" /> },
  { id: "upcoming", label: "Próximas", icon: <Clock className="h-3.5 w-3.5" /> },
  { id: "overdue", label: "Atrasadas", icon: <Flag className="h-3.5 w-3.5" />, accent: true },
  { id: "nodate", label: "Sin fecha", icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { id: "all", label: "Todas", icon: <ListTodo className="h-3.5 w-3.5" /> },
  { id: "unassigned", label: "Sin actividad", icon: <Inbox className="h-3.5 w-3.5" /> },
  { id: "completed", label: "Completadas", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { id: "archived", label: "Archivadas", icon: <Archive className="h-3.5 w-3.5" /> },
  { id: "trash", label: "Papelera", icon: <Trash2 className="h-3.5 w-3.5" /> },
];

function TodoPage() {
  const { store, setStore, hydrated } = useTimeStore();
  const [view, setView] = useState<View>("today");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [priorityFilter, setPriorityFilter] = useState<Set<TaskPriority>>(new Set());
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [hideDone, setHideDone] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const toggleTheme = () =>
    setStore({ ...store, theme: store.theme === "dark" ? "light" : "dark" });

  const viewDefaults = (): Partial<ParsedTask> =>
    view === "today"
      ? { dueDate: todayISO() }
      : view === "unassigned"
        ? {}
        : {};

  const openNew = (preset?: Partial<Task>) => {
    setEditing(emptyTaskDraft({ ...viewDefaults(), ...preset }));
    setOpenEditor(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setOpenEditor(true);
  };

  const saveTask = (t: Task) => {
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

  const quickCreate = (p: ParsedTask) => {
    setStore(createTask(store, p as Partial<Task>));
    toast.success("Tarea creada", { duration: 1200 });
  };

  const remove = (t: Task) => {
    setStore(trashTask(store, t.id));
    toast.success("Tarea enviada a papelera", {
      action: { label: "Deshacer", onClick: () => setStore(restoreTask(store, t.id)) },
    });
  };

  const rowActions = (t: Task) => ({
    onToggle: () =>
      setStore(
        updateTask(store, t.id, {
          status: (t.status === "completed" ? "pending" : "completed") as TaskStatus,
        }),
      ),
    onEdit: () => openEdit(t),
    onDuplicate: () => {
      setStore(duplicateTask(store, t.id));
      toast.success("Tarea duplicada");
    },
    onArchive: () => setStore(updateTask(store, t.id, { archived: !t.archived })),
    onDelete: () => remove(t),
    onRestore: () => setStore(restoreTask(store, t.id)),
    onPurge: () => setStore(purgeTask(store, t.id)),
    onPriority: (p: TaskPriority) => setStore(updateTask(store, t.id, { priority: p })),
    onReschedule: (iso?: string) => setStore(updateTask(store, t.id, { dueDate: iso })),
  });

  // ---- derived ----
  const baseList = useMemo<Task[]>(() => {
    switch (view) {
      case "today":
        return tasksToday(store);
      case "upcoming":
        return tasksUpcoming(store);
      case "overdue":
        return tasksOverdue(store);
      case "nodate":
        return tasksNoDate(store);
      case "completed":
        return tasksCompleted(store);
      case "unassigned":
        return tasksUnassigned(store);
      case "archived":
        return tasksArchived(store);
      case "trash":
        return tasksTrashed(store);
      default:
        return allTasks(store).filter((t) => !t.archived);
    }
  }, [store, view]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = baseList;
    if (q)
      out = out.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.tags ?? []).some((x) => x.toLowerCase().includes(q)),
      );
    if (priorityFilter.size > 0) out = out.filter((t) => priorityFilter.has(t.priority));
    if (activityFilter !== "all")
      out = out.filter((t) =>
        activityFilter === "__none__" ? !t.activityId : t.activityId === activityFilter,
      );
    if (tagFilter !== "all") out = out.filter((t) => (t.tags ?? []).includes(tagFilter));
    if (hideDone && view !== "completed" && view !== "trash" && view !== "archived")
      out = out.filter((t) => t.status !== "completed");
    return sortTasks(out, sortBy);
  }, [baseList, query, sortBy, priorityFilter, activityFilter, tagFilter, hideDone, view]);

  const listStats = useMemo(() => taskStats(list), [list]);

  const gStats = useMemo(() => {
    const all = allTasks(store);
    const today = tasksToday(store);
    const ts = taskStats(today);
    return {
      ...taskStats(all),
      streakDay: dailyStreak(all),
      streakWeek: weeklyStreak(all),
      todayScore: ts.plannedMin > 0 ? (ts.doneMin / ts.plannedMin) * 100 : 0,
      todayDone: ts.doneMin,
      todayPlanned: ts.plannedMin,
      overdue: tasksOverdue(store).length,
    };
  }, [store]);

  const counts = useMemo(
    () => ({
      today: tasksToday(store).filter((t) => t.status !== "completed").length,
      upcoming: tasksUpcoming(store).filter((t) => t.status !== "completed").length,
      overdue: tasksOverdue(store).length,
      nodate: tasksNoDate(store).length,
      all: allTasks(store).filter((t) => !t.archived && t.status !== "completed").length,
      unassigned: tasksUnassigned(store).filter((t) => t.status !== "completed").length,
      completed: tasksCompleted(store).length,
      archived: tasksArchived(store).length,
      trash: tasksTrashed(store).length,
    }),
    [store],
  ) as Record<View, number>;

  const tags = useMemo(() => allTags(store), [store]);

  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const bulk = (fn: (ids: string[]) => Store, msg: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setStore(fn(ids));
    clearSelection();
    toast.success(msg);
  };

  const renderRow = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      store={store}
      isTrash={view === "trash"}
      selectMode={selectMode}
      selected={selected.has(t.id)}
      onSelectChange={(v) =>
        setSelected((prev) => {
          const n = new Set(prev);
          if (v) n.add(t.id);
          else n.delete(t.id);
          return n;
        })
      }
      actions={rowActions(t)}
    />
  );

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    if (groupBy === "priority")
      return (Object.entries(groupByPriority(list)) as [TaskPriority, Task[]][])
        .filter(([, arr]) => arr.length > 0)
        .sort(([a], [b]) => TASK_PRIORITY_META[b].weight - TASK_PRIORITY_META[a].weight)
        .map(([p, arr]) => ({
          key: p,
          title: TASK_PRIORITY_META[p].label,
          color: TASK_PRIORITY_META[p].color,
          tasks: arr,
        }));
    if (groupBy === "goal")
      return groupByGoal(list, store.goals).map(({ goal, tasks }) => ({
        key: goal?.id ?? "none",
        title: goal ? `${goal.icon ?? "🎯"} ${goal.name}` : "Sin objetivo",
        color: goal?.color ?? "var(--muted-foreground)",
        tasks,
      }));
    if (groupBy === "activity")
      return groupByActivity(list, store.activities).map(({ activity, tasks }) => ({
        key: activity?.id ?? "none",
        title: activity?.name ?? "Sin actividad",
        color: activity?.color ?? "var(--muted-foreground)",
        tasks,
      }));
    return groupByDate(list).map(({ date, tasks }) => ({
      key: date,
      title: date === "__none__" ? "Sin fecha" : dateLabel(date),
      color: "var(--muted-foreground)",
      tasks,
    }));
  }, [groupBy, list, store.goals, store.activities]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 lg:pb-0">
      <Toaster position="top-center" />
      <TimerBar
        activities={store.activities}
        onCompleteTasks={(activityId, taskIds) => {
          const ids = new Set(taskIds);
          setStore({
            ...store,
            activities: store.activities.map((a) =>
              a.id === activityId
                ? {
                    ...a,
                    tasks: (a.tasks ?? []).map((t) =>
                      ids.has(t.id)
                        ? { ...t, status: "completed" as const, completedAt: Date.now() }
                        : t,
                    ),
                  }
                : a,
            ),
            tasks: (store.tasks ?? []).map((t) =>
              ids.has(t.id) ? { ...t, status: "completed" as const, completedAt: Date.now() } : t,
            ),
          });
        }}
      />

      <header className="border-b border-border/60 backdrop-blur-xl bg-background/85 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-2.5 flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> 168
          </Link>
          <Link
            to="/calendar"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            Calendario
          </Link>
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l">
            <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <h1 className="font-display text-lg leading-none">To-Do</h1>
          </div>

          <div className="ml-auto flex items-center gap-1.5 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="h-9 pl-8 w-full sm:w-64 text-sm"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => openNew()} className="hidden sm:inline-flex gap-1.5">
              <Plus className="h-4 w-4" /> Nueva
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
              {store.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile view chips */}
        <div className="lg:hidden overflow-x-auto no-scrollbar border-t border-border/60">
          <div className="flex gap-1.5 px-3 py-2 w-max">
            {VIEW_META.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition ${
                  view === v.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {v.icon}
                {v.label}
                {counts[v.id] > 0 && (
                  <span
                    className={`tabular-nums ${
                      view === v.id
                        ? "opacity-80"
                        : v.accent
                          ? "text-destructive font-medium"
                          : ""
                    }`}
                  >
                    {counts[v.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4 sm:py-6 grid gap-5 lg:grid-cols-[230px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block space-y-1 lg:sticky lg:top-20 lg:self-start">
          {VIEW_META.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                view === v.id ? "bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              <span
                className={
                  view === v.id
                    ? "text-background/80"
                    : v.accent && counts[v.id] > 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {v.icon}
              </span>
              <span className="flex-1 text-left truncate">{v.label}</span>
              {counts[v.id] > 0 && (
                <span
                  className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                    view === v.id
                      ? "bg-background/20"
                      : v.accent
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[v.id]}
                </span>
              )}
            </button>
          ))}
        </aside>

        <section className="space-y-4 min-w-0">
          {/* Stats — horizontal scroll on mobile */}
          <div className="-mx-3 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex sm:grid sm:grid-cols-4 gap-2.5 px-3 sm:px-0 w-max sm:w-auto">
              <Stat
                label="Pendientes"
                value={String(gStats.pending + gStats.inProg)}
                sub={`${gStats.overdue} atrasadas`}
              />
              <Stat
                label="Completado"
                value={`${gStats.pct.toFixed(0)}%`}
                sub={`${gStats.done} de ${gStats.total}`}
                progress={gStats.pct}
              />
              <Stat
                label="Hoy"
                value={`${gStats.todayScore.toFixed(0)}%`}
                sub={`${fmtMinutes(gStats.todayDone)} / ${fmtMinutes(gStats.todayPlanned)}`}
                progress={gStats.todayScore}
              />
              <Stat
                label="Racha"
                value={`${gStats.streakDay}d`}
                sub={`${gStats.streakWeek} semanas seguidas`}
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl">
              {VIEW_META.find((v) => v.id === view)?.label}
            </h2>
            <span className="text-xs text-muted-foreground">
              {list.length} · {fmtMinutes(listStats.plannedMin)}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin agrupar</SelectItem>
                  <SelectItem value="activity">Por actividad</SelectItem>
                  <SelectItem value="priority">Por prioridad</SelectItem>
                  <SelectItem value="goal">Por objetivo</SelectItem>
                  <SelectItem value="date">Por fecha</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-8 w-[118px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Prioridad</SelectItem>
                  <SelectItem value="date">Fecha</SelectItem>
                  <SelectItem value="duration">Duración</SelectItem>
                  <SelectItem value="name">Nombre</SelectItem>
                  <SelectItem value="created">Creación</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={selectMode ? "default" : "outline"}
                onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
                className="h-8 text-xs"
              >
                {selectMode ? "Salir" : "Seleccionar"}
              </Button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="-mx-3 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 px-3 sm:px-0 w-max">
              {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => {
                const on = priorityFilter.has(p);
                const meta = TASK_PRIORITY_META[p];
                return (
                  <button
                    key={p}
                    onClick={() =>
                      setPriorityFilter((prev) => {
                        const n = new Set(prev);
                        if (n.has(p)) n.delete(p);
                        else n.add(p);
                        return n;
                      })
                    }
                    className="text-[11px] px-2.5 py-1 rounded-full border transition whitespace-nowrap"
                    style={
                      on
                        ? { background: meta.color, borderColor: meta.color, color: "var(--background)" }
                        : { borderColor: `color-mix(in oklab, ${meta.color} 35%, transparent)` }
                    }
                  >
                    {meta.label}
                  </button>
                );
              })}
              <Select value={activityFilter} onValueChange={setActivityFilter}>
                <SelectTrigger className="h-7 w-[132px] text-[11px]">
                  <SelectValue placeholder="Actividad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda actividad</SelectItem>
                  <SelectItem value="__none__">Sin actividad</SelectItem>
                  {store.activities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tags.length > 0 && (
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-7 w-[118px] text-[11px]">
                    <SelectValue placeholder="Etiqueta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda etiqueta</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t} value={t}>
                        #{t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                onClick={() => setHideDone((v) => !v)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                  hideDone ? "bg-muted" : ""
                }`}
              >
                {hideDone ? "Ocultando completadas" : "Mostrando completadas"}
              </button>
              {(priorityFilter.size > 0 || activityFilter !== "all" || tagFilter !== "all") && (
                <button
                  onClick={() => {
                    setPriorityFilter(new Set());
                    setActivityFilter("all");
                    setTagFilter("all");
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-dashed text-muted-foreground whitespace-nowrap"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Quick add */}
          {view !== "trash" && view !== "archived" && (
            <QuickAdd
              store={store}
              defaults={viewDefaults()}
              onCreate={quickCreate}
              onOpenFull={(p) => openNew(p as Partial<Task>)}
            />
          )}

          {/* List */}
          <div className="rounded-3xl border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
            {list.length === 0 ? (
              <EmptyState view={view} onCreate={() => openNew()} />
            ) : grouped ? (
              <div className="divide-y">
                {grouped.map((g) => (
                  <GroupSection key={g.key} title={g.title} color={g.color} count={g.tasks.length}>
                    {g.tasks.map(renderRow)}
                  </GroupSection>
                ))}
              </div>
            ) : (
              <ul className="divide-y">{list.map(renderRow)}</ul>
            )}
          </div>

          {view === "trash" && counts.trash > 0 && (
            <Button variant="outline" size="sm" onClick={() => setConfirmPurge(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Vaciar papelera
            </Button>
          )}

          <WeekStrip
            store={store}
            onDrop={(taskId, dueDate) => setStore(updateTask(store, taskId, { dueDate }))}
            onOpen={openEdit}
          />
        </section>
      </main>

      {/* Mobile FAB */}
      <button
        onClick={() => openNew()}
        aria-label="Nueva tarea"
        className="sm:hidden fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center active:scale-95 transition"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Bulk bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2.5 animate-fade-in">
          <div className="mx-auto max-w-[1400px] flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{selected.size} seleccionadas</span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulk((ids) => updateManyTasks(store, ids, { status: "completed" }), "Completadas")
                }
              >
                <Check className="h-3.5 w-3.5 mr-1" /> Completar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulk(
                    (ids) => updateManyTasks(store, ids, { dueDate: todayISO() }),
                    "Movidas a hoy",
                  )
                }
              >
                Hoy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk((ids) => trashManyTasks(store, ids), "Enviadas a papelera")}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      <TaskEditorSheet
        open={openEditor}
        task={editing}
        store={store}
        onClose={() => {
          setOpenEditor(false);
          setEditing(null);
        }}
        onSave={saveTask}
        onDelete={(t) => {
          remove(t);
          setOpenEditor(false);
          setEditing(null);
        }}
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

function Stat({
  label,
  value,
  sub,
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-[var(--shadow-soft)] min-w-[140px]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-xl mt-1 leading-none truncate">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-foreground transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
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
        <span className="truncate">{title}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && <ul className="divide-y">{children}</ul>}
    </div>
  );
}

function EmptyState({ view, onCreate }: { view: View; onCreate: () => void }) {
  const messages: Record<View, string> = {
    today: "No tenés tareas para hoy. ¡Buen momento para planificar!",
    upcoming: "No hay tareas próximas.",
    overdue: "No hay tareas atrasadas. ¡Al día!",
    nodate: "Todas tus tareas tienen fecha.",
    completed: "Aún no completaste ninguna tarea.",
    unassigned: "Todas tus tareas tienen actividad asignada.",
    archived: "No hay tareas archivadas.",
    trash: "La papelera está vacía.",
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
