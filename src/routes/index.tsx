import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileImage,
  FileText,
  Moon,
  Pencil,
  Plus,
  Sun,
  Table2,
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
import { GoalsPanel } from "@/components/time/GoalsPanel";
import {
  CATEGORIES,
  nextColor,
  uid,
  useTimeStore,
  weeklyHours,
  type Activity,
  type Category,
} from "@/lib/time-store";
import { exportCSV, exportPDF, exportPNG } from "@/lib/time-export";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "168 · Visualiza tu semana en horas" },
      {
        name: "description",
        content:
          "Dashboard interactivo para ver cómo distribuyes las 168 horas de tu semana: donut proporcional, estadísticas, objetivos y vista semanal.",
      },
      { property: "og:title", content: "168 · Visualiza tu semana" },
      {
        property: "og:description",
        content: "Un dashboard elegante para entender y equilibrar tu tiempo semanal.",
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
  const [filter, setFilter] = useState<Category | "all">("all");
  const chartRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (filter === "all" ? store.activities : store.activities.filter((a) => a.category === filter)),
    [store.activities, filter],
  );

  const totalUsed = store.activities.reduce((s, a) => s + weeklyHours(a), 0);
  const free = Math.max(0, TOTAL - totalUsed);
  const overflow = totalUsed > TOTAL;
  const topActivity = [...store.activities].sort((a, b) => weeklyHours(b) - weeklyHours(a))[0];

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

  const remove = (id: string) =>
    setStore({ ...store, activities: store.activities.filter((a) => a.id !== id) });

  const duplicate = (a: Activity) =>
    setStore({
      ...store,
      activities: [...store.activities, { ...a, id: uid(), name: `${a.name} (copia)` }],
    });

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

          {/* Chart card */}
          <div className="rounded-3xl border bg-card p-6 md:p-10 shadow-[var(--shadow-soft)]">
            <div ref={chartRef}>
              <DonutChart activities={filtered} />
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

          {/* Week grid */}
          <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg">Vista semanal</h2>
              <span className="text-xs text-muted-foreground">
                Distribución aproximada por día
              </span>
            </div>
            <WeekGrid activities={filtered} />
          </div>
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
                    onCancel={() => {
                      setOpen(false);
                      setEditing(null);
                    }}
                    onSubmit={upsert}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="max-h-[420px]">
              <ul className="divide-y">
                {store.activities.length === 0 && (
                  <li className="p-6 text-sm text-muted-foreground text-center">
                    Todavía no agregaste actividades.
                  </li>
                )}
                {store.activities.map((a) => {
                  const h = weeklyHours(a);
                  return (
                    <li key={a.id} className="p-4 group">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ background: a.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{a.name}</span>
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {a.hoursPerDay}h × {a.daysPerWeek}d ={" "}
                            <span className="text-foreground font-medium">{h.toFixed(1)}h</span>
                          </div>
                        </div>
                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <IconBtn onClick={() => remove(a.id)} label="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconBtn>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <h2 className="font-display text-lg mb-3">Objetivos</h2>
            <GoalsPanel
              goals={store.goals}
              activities={store.activities}
              onChange={(goals) => setStore({ ...store, goals })}
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

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}
