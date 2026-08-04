import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  Copy,
  Download,
  FileImage,
  FileText,
  LayoutGrid,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Sun,
  CheckSquare,
  ListChecks,
  Layers,
  Table2,
  Target,
  Trash2,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { DonutChart } from "@/components/time/DonutChart";
import { ActivityForm } from "@/components/time/ActivityForm";
import { WeekGrid } from "@/components/time/WeekGrid";
import { GoalsManager } from "@/components/time/GoalsManager";
import { DayPlanner } from "@/components/time/DayPlanner";
import { DayView } from "@/components/time/DayView";
import { Calendar, CalendarDays } from "lucide-react";

import {
  CATEGORIES,
  nextColor,
  taskProgress,
  uid,
  useTimeStore,
  weeklyHours,
  type Activity,
  type Category,
  type ChartView,
  type Goal,
  type Task,
} from "@/lib/time-store";
import { allTasks, taskColor, taskMinutes, tasksInWeek } from "@/lib/task-utils";
import { exportCSV, exportPDF, exportPNG } from "@/lib/time-export";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "168 · Visualiza tu semana en un círculo" },
      {
        name: "description",
        content:
          "Dashboard interactivo para ver cómo distribuyes las 168 horas de tu semana: donut proporcional, estadísticas, objetivos y vista semanal.",
      },
      { property: "og:title", content: "168 · Visualiza tu semana en un círculo" },
      {
        property: "og:description",
        content: "Dashboard interactivo para ver cómo distribuyes las 168 horas de tu semana: donut proporcional, estadísticas, objetivos y vista semanal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TOTAL = 168;

function Index() {
  const { store, setStore, hydrated } = useTimeStore();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [scope, setScope] = useState<"week" | "day">("week");
  const chartRef = useRef<HTMLDivElement>(null);



  const chartView: ChartView = store.chartView ?? "activities";
  const setChartView = (v: ChartView) => setStore({ ...store, chartView: v });

  const filtered = useMemo(
    () => (filter === "all" ? store.activities : store.activities.filter((a) => a.category === filter)),
    [store.activities, filter],
  );

  // Aggregate top-level + activity-inline tasks
  const allT = useMemo(() => allTasks(store), [store]);

  // For "goals" view, synthesize pseudo-activities grouped by goal so the donut renders groups.
  const chartActivities = useMemo<Activity[]>(() => {
    if (chartView === "activities" || chartView === "combined") return filtered;
    if (chartView === "tasks") {
      // Each task → pseudo-activity with weeklyHours = estimatedMinutes/60
      return tasksInWeek(store)
        .map((t) => ({
          id: `task-${t.id}`,
          name: t.name,
          hoursPerDay: taskMinutes(t) / 60,
          daysPerWeek: 1,
          color: taskColor(t, store),
          category: t.category ?? "otro",
        }));
    }
    // goals
    const items: Activity[] = [];
    for (const g of store.goals) {
      if (!g.active) continue;
      const linked = filtered.filter((a) => a.goalIds?.includes(g.id));
      const hours = linked.reduce((s, a) => s + weeklyHours(a), 0);
      if (hours <= 0) continue;
      items.push({
        id: `goal-${g.id}`,
        name: `${g.icon ?? "🎯"} ${g.name}`,
        hoursPerDay: hours,
        daysPerWeek: 1,
        color: g.color,
        category: "otro",
      });
    }
    const unlinked = filtered.filter((a) => !a.goalIds || a.goalIds.length === 0);
    const unlinkedHours = unlinked.reduce((s, a) => s + weeklyHours(a), 0);
    if (unlinkedHours > 0) {
      items.push({
        id: "goal-unlinked",
        name: "Sin objetivo",
        hoursPerDay: unlinkedHours,
        daysPerWeek: 1,
        color: "var(--muted-foreground)",
        category: "otro",
      });
    }
    return items;
  }, [chartView, filtered, store, allT]);

  // For combined mode: subdivide each activity outer arc by its tasks
  const subSegments = useMemo<Record<string, { id: string; name: string; hours: number; color: string }[]>>(() => {
    if (chartView !== "combined") return {};
    const map: Record<string, { id: string; name: string; hours: number; color: string }[]> = {};
    for (const a of filtered) {
      const linked = tasksInWeek(store).filter((t) => t.activityId === a.id);
      if (linked.length === 0) continue;
      map[a.id] = linked.map((t) => ({
        id: t.id,
        name: t.name,
        hours: taskMinutes(t) / 60,
        color: taskColor(t, store),
      }));
    }
    return map;
  }, [chartView, filtered, allT, store]);

  const totalUsed = store.activities.reduce((s, a) => s + weeklyHours(a), 0);
  const free = Math.max(0, TOTAL - totalUsed);
  const overflow = totalUsed > TOTAL;
  const topActivity = [...store.activities].sort((a, b) => weeklyHours(b) - weeklyHours(a))[0];

  const taskStats = useMemo(() => {
    let total = 0,
      done = 0,
      inProg = 0,
      pending = 0;
    let topByCount: { name: string; count: number } | null = null;
    let topByCompletion: { name: string; pct: number; total: number } | null = null;
    for (const a of store.activities) {
      const tp = taskProgress(a);
      total += tp.total;
      done += tp.completed;
      inProg += tp.inProgress;
      pending += tp.pending;
      if (tp.total > 0 && (!topByCount || tp.total > topByCount.count)) {
        topByCount = { name: a.name, count: tp.total };
      }
      if (tp.total >= 2 && (!topByCompletion || tp.pct > topByCompletion.pct)) {
        topByCompletion = { name: a.name, pct: tp.pct, total: tp.total };
      }
    }
    const pct = total > 0 ? (done / total) * 100 : 0;
    return { total, done, inProg, pending, pct, topByCount, topByCompletion };
  }, [store.activities]);

  const updateTasks = (activityId: string, updater: (tasks: Task[]) => Task[]) => {
    setStore({
      ...store,
      activities: store.activities.map((a) =>
        a.id === activityId ? { ...a, tasks: updater(a.tasks ?? []) } : a,
      ),
    });
  };

  const upsert = (data: Omit<Activity, "id">) => {
    if (editing) {
      const next = store.activities.map((a) => (a.id === editing.id ? { ...editing, ...data } : a));
      const newTotal = next.reduce((s, a) => s + weeklyHours(a), 0);
      if (newTotal > TOTAL) {
        toast.warning(`Has superado las 168h (${newTotal.toFixed(1)}h)`);
      }
      setStore({ ...store, activities: next });
      toast.success("Actividad actualizada");
    } else {
      const newTotal = totalUsed + data.hoursPerDay * data.daysPerWeek;
      if (newTotal > TOTAL) {
        toast.warning(`Al agregar superarías 168h (${newTotal.toFixed(1)}h)`);
      }
      setStore({
        ...store,
        activities: [...store.activities, { id: uid(), ...data }],
      });
      toast.success("Actividad agregada");
    }
    setEditing(null);
    setOpen(false);
  };

  const remove = (id: string) => {
    setStore({
      ...store,
      activities: store.activities.filter((a) => a.id !== id),
    });
    toast.success("Actividad eliminada");
  };


  const duplicate = (a: Activity) =>
    setStore({
      ...store,
      activities: [...store.activities, { ...a, id: uid(), name: `${a.name} (copia)`, permanent: false }],
    });

  const togglePermanent = (id: string) =>
    setStore({
      ...store,
      activities: store.activities.map((a) =>
        a.id === id ? { ...a, permanent: !a.permanent } : a,
      ),
    });

  const createGoal = (data: Omit<Goal, "id" | "createdAt">): Goal => {
    const g: Goal = { ...data, id: uid(), createdAt: Date.now() };
    setStore({ ...store, goals: [...store.goals, g] });
    toast.success(`Objetivo "${g.name}" creado`);
    return g;
  };

  const startNewWeek = () => {
    const kept = store.activities.filter((a) => a.permanent);
    const removed = store.activities.length - kept.length;
    setStore({ ...store, activities: kept });
    toast.success(
      removed > 0
        ? `Nueva semana iniciada · ${kept.length} permanentes conservadas, ${removed} eliminadas`
        : "Nueva semana iniciada",
    );
  };

  const toggleTheme = () =>
    setStore({ ...store, theme: store.theme === "dark" ? "light" : "dark" });

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/80 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-display text-lg">
              168
            </div>
            <div>
              <h1 className="font-display text-xl leading-none">Tu semana en horas</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Distribuye, visualiza y equilibra 168 horas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/todo"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
            >
              <CheckSquare className="h-4 w-4" /> To-Do
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> Nueva semana
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display text-2xl">
                    ¿Comenzar una nueva semana?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán todas las actividades temporales. Las actividades
                    marcadas como <span className="font-medium text-foreground">permanentes</span>{" "}
                    se conservarán con toda su información.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {(() => {
                  const perm = store.activities.filter((a) => a.permanent).length;
                  const temp = store.activities.length - perm;
                  return (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border p-3">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          Se conservan
                        </div>
                        <div className="font-display text-2xl mt-1">{perm}</div>
                        <div className="text-xs text-muted-foreground">permanentes</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          Se eliminan
                        </div>
                        <div className="font-display text-2xl mt-1">{temp}</div>
                        <div className="text-xs text-muted-foreground">temporales</div>
                      </div>
                    </div>
                  );
                })()}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={startNewWeek}>
                    Sí, comenzar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportPDF(store.activities)}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    exportPNG(chartRef.current?.querySelector("svg") as SVGSVGElement | null)
                  }
                >
                  <FileImage className="h-4 w-4 mr-2" /> PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(store.activities)}>
                  <Table2 className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
              {store.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: chart + stats + week */}
        <div className="space-y-6 min-w-0">
          {/* Scope tabs: Semana / Día */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border bg-muted/40 p-1 text-sm">
              <button
                onClick={() => setScope("week")}
                className={`px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 transition ${
                  scope === "week" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Semana
                <span className="text-[10px] text-muted-foreground ml-1">168h</span>
              </button>
              <button
                onClick={() => setScope("day")}
                className={`px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 transition ${
                  scope === "day" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" /> Día
                <span className="text-[10px] text-muted-foreground ml-1">24h</span>
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">

            <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
            <button
              onClick={() => setFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                filter === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "hover:bg-accent"
              }`}
            >
              Todas
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
                  filter === c.id ? "bg-foreground text-background border-foreground" : "hover:bg-accent"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: c.color }}
                />
                {c.label}
              </button>
            ))}
          </div>

          {scope === "week" ? (
          <>
          {/* Chart card */}
          <div className="rounded-3xl border bg-card p-6 md:p-10 shadow-[var(--shadow-soft)]">

            <div className="flex justify-center mb-4">
              <div className="inline-flex rounded-full border bg-muted/40 p-1 text-xs flex-wrap">
                {([
                  ["activities", "Actividades", <LayoutGrid className="h-3 w-3" key="a" />],
                  ["goals", "Objetivos", <Target className="h-3 w-3" key="g" />],
                  ["tasks", "Tareas", <ListChecks className="h-3 w-3" key="t" />],
                  ["combined", "Combinado", <Layers className="h-3 w-3" key="c" />],
                ] as [ChartView, string, React.ReactElement][]).map(([v, label, icon]) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 transition ${
                      chartView === v ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
            <div ref={chartRef}>
              <DonutChart
                activities={chartActivities}
                subSegments={chartView === "combined" ? subSegments : undefined}
              />
            </div>

            {/* Live counter */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
              <div
                className={`px-4 py-2 rounded-full ${
                  overflow
                    ? "bg-destructive/10 text-destructive"
                    : free < 10
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {overflow
                  ? `Has superado las 168 horas por ${(totalUsed - TOTAL).toFixed(1)}h`
                  : `Te quedan ${free.toFixed(1)}h libres esta semana`}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Ocupadas" value={`${totalUsed.toFixed(1)}h`} sub={`${((totalUsed / TOTAL) * 100).toFixed(0)}% semana`} />
            <StatCard label="Libres" value={`${free.toFixed(1)}h`} sub={`${((free / TOTAL) * 100).toFixed(0)}% semana`} />
            <StatCard label="Actividades" value={String(store.activities.length)} sub="registradas" />
            <StatCard
              label="Top actividad"
              value={topActivity?.name ?? "—"}
              sub={topActivity ? `${weeklyHours(topActivity).toFixed(1)}h/sem` : ""}
            />
            <StatCard
              label="Prom. ocupado / día"
              value={`${(totalUsed / 7).toFixed(1)}h`}
              sub="lunes a domingo"
            />
            <StatCard
              label="Prom. libre / día"
              value={`${(free / 7).toFixed(1)}h`}
              sub="lunes a domingo"
            />
            <StatCard
              label="Categorías activas"
              value={String(new Set(store.activities.map((a) => a.category)).size)}
              sub={`de ${CATEGORIES.length}`}
            />
            <StatCard
              label="Sueño"
              value={`${(store.activities.find((a) => /dormir|sue/i.test(a.name)) ? weeklyHours(store.activities.find((a) => /dormir|sue/i.test(a.name))!) : 0).toFixed(0)}h`}
              sub="por semana"
            />
          </div>

          {/* Task stats */}
          <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg">Tareas</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {taskStats.done}/{taskStats.total} completadas
              </span>
            </div>
            {taskStats.total > 0 ? (
              <>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
                  <div
                    className="h-full bg-foreground transition-all duration-500"
                    style={{ width: `${taskStats.pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total" value={String(taskStats.total)} sub="tareas registradas" />
                  <StatCard label="Pendientes" value={String(taskStats.pending)} sub="por hacer" />
                  <StatCard label="En progreso" value={String(taskStats.inProg)} sub="activas" />
                  <StatCard label="Completadas" value={`${taskStats.pct.toFixed(0)}%`} sub={`${taskStats.done} tareas`} />
                  {taskStats.topByCount && (
                    <StatCard
                      label="Más tareas"
                      value={taskStats.topByCount.name}
                      sub={`${taskStats.topByCount.count} tareas`}
                    />
                  )}
                  {taskStats.topByCompletion && (
                    <StatCard
                      label="Mayor avance"
                      value={taskStats.topByCompletion.name}
                      sub={`${taskStats.topByCompletion.pct.toFixed(0)}% completado`}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay tareas. Editá una actividad para agregar tareas dentro de ella.
              </p>
            )}
          </div>


          {/* Week grid + day planner */}
          <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)] space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Vista semanal</h2>
              <span className="text-xs text-muted-foreground">
                Global de la semana y planificación diaria
              </span>
            </div>
            <WeekGrid activities={filtered} />
            <div className="pt-4 border-t">
              <DayPlanner
                activities={filtered}
                goals={store.goals}
                onNew={() => {
                  setEditing(null);
                  setOpen(true);
                }}
                onEdit={(a) => {
                  setEditing(a);
                  setOpen(true);
                }}
                onDuplicate={(a) => duplicate(a)}
                onDelete={(a) => setDeleting(a)}
              />
            </div>
          </div>
          </>
          ) : (
            <DayView
              activities={filtered}
              goals={store.goals}
              onEdit={(a) => {
                setEditing(a);
                setOpen(true);
              }}
              onDuplicate={(a) => duplicate(a)}
              onDelete={(a) => setDeleting(a)}
            />
          )}

        </div>


        {/* RIGHT: side panel */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg leading-tight">Actividades</h2>
                <p className="text-xs text-muted-foreground">
                  {store.activities.length} · {totalUsed.toFixed(1)}h / 168h
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
                    <Plus className="h-4 w-4 mr-1" /> Nueva
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl">
                      {editing ? "Editar actividad" : "Nueva actividad"}
                    </DialogTitle>
                  </DialogHeader>
                  <ActivityForm
                    initial={editing ?? undefined}
                    defaultColor={nextColor(store.activities)}
                    goals={store.goals}
                    onCreateGoal={createGoal}
                    onCancel={() => {
                      setOpen(false);
                      setEditing(null);
                    }}
                    onSubmit={upsert}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="h-[min(60vh,480px)]">
              <ul className="divide-y">
                {store.activities.length === 0 && (
                  <li className="p-6 text-sm text-muted-foreground text-center">
                    Todavía no agregaste actividades.
                  </li>
                )}
                {store.activities.map((a) => {
                  const h = weeklyHours(a);
                  return (
                    <li key={a.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="h-3 w-3 mt-1.5 rounded-full shrink-0"
                          style={{ background: a.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{a.name}</span>
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category}
                            </Badge>
                            {a.permanent && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-foreground/8 border border-foreground/15 px-1.5 py-0.5 text-[10px] font-medium">
                                <Pin className="h-2.5 w-2.5" /> Permanente
                              </span>
                            )}
                            {(a.goalIds ?? []).map((gid) => {
                              const g = store.goals.find((x) => x.id === gid);
                              if (!g) return null;
                              return (
                                <span
                                  key={gid}
                                  className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    background: `color-mix(in oklab, ${g.color} 15%, transparent)`,
                                    borderColor: `color-mix(in oklab, ${g.color} 40%, transparent)`,
                                  }}
                                >
                                  {g.icon ?? "🎯"} {g.name}
                                </span>
                              );
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                            {a.hoursPerDay}h × {a.daysPerWeek}d ={" "}
                            <span className="text-foreground font-medium">{h.toFixed(1)}h</span>
                          </div>
                          <InlineTasks
                            activity={a}
                            onChange={(tasks) => updateTasks(a.id, () => tasks)}
                          />

                          <div className="mt-2 flex items-center gap-1 -ml-1.5">
                            <IconBtn
                              onClick={() => togglePermanent(a.id)}
                              label={a.permanent ? "Quitar permanente" : "Marcar permanente"}
                            >
                              {a.permanent ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </IconBtn>
                            <IconBtn onClick={() => duplicate(a)} label="Duplicar">
                              <Copy className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              onClick={() => {
                                setEditing(a);
                                setOpen(true);
                              }}
                              label="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              onClick={() => setDeleting(a)}
                              label="Eliminar"
                              danger
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>

          <AlertDialog
            open={deleting !== null}
            onOpenChange={(v) => !v && setDeleting(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-2xl">
                  ¿Eliminar “{deleting?.name}”?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Estás seguro de que querés eliminar esta actividad? Esta acción no
                  se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (deleting) remove(deleting.id);
                    setDeleting(null);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>


          <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <GoalsManager
              goals={store.goals}
              activities={store.activities}
              onGoalsChange={(goals) => setStore({ ...store, goals })}
              onActivitiesChange={(activities) => setStore({ ...store, activities })}
            />
          </div>
        </aside>
      </main>

      <footer className="mx-auto max-w-[1400px] px-6 py-8 text-xs text-muted-foreground">
        Los datos se guardan automáticamente en tu navegador.
      </footer>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-2xl mt-1 leading-none truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function InlineTasks({
  activity,
  onChange,
}: {
  activity: Activity;
  onChange: (tasks: Task[]) => void;
}) {
  const tasks = activity.tasks ?? [];
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct = (done / tasks.length) * 100;
  const preview = tasks.slice(0, 3);
  const more = tasks.length - preview.length;
  const toggle = (id: string) =>
    onChange(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === "completed" ? "pending" : "completed",
              completedAt: t.status === "completed" ? undefined : Date.now(),
            }
          : t,
      ),
    );
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums mb-1">
        <span>
          {done}/{tasks.length} tareas
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden mb-1.5">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: activity.color }}
        />
      </div>
      <ul className="space-y-0.5">
        {preview.map((t) => {
          const isDone = t.status === "completed";
          return (
            <li key={t.id} className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => toggle(t.id)}
                aria-label={isDone ? "Desmarcar" : "Completar"}
                className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                  isDone
                    ? "bg-foreground border-foreground"
                    : "border-muted-foreground/40 hover:border-foreground"
                }`}
              >
                {isDone && <Check className="h-2.5 w-2.5 text-background" />}
              </button>
              <span className={`truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                {t.name}
              </span>
              {t.dueDate && !isDone && (
                <span className="text-[10px] text-muted-foreground shrink-0">· {t.dueDate}</span>
              )}
            </li>
          );
        })}
        {more > 0 && (
          <li className="text-[10px] text-muted-foreground pl-5">+{more} más</li>
        )}
      </ul>
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

