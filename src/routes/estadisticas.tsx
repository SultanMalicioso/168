import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { SyncBadge } from "@/components/sync/SyncBadge";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { TimerBar } from "@/components/time/TimerBar";
import { TimeInsights } from "@/components/time/TimeInsights";
import { CATEGORIES, getWeekKey, useTimeStore, type Category } from "@/lib/time-store";
import { useTimerStore } from "@/lib/timer-store";
import { formatWeekRange } from "@/lib/week-utils";

export const Route = createFileRoute("/estadisticas")({
  head: () => ({
    meta: [
      { title: "Análisis del tiempo · 168" },
      {
        name: "description",
        content:
          "Planificado vs real, distribución del tiempo registrado y evolución semana a semana.",
      },
      { property: "og:title", content: "Análisis del tiempo · 168" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { store, hydrated, goToPreviousWeek, goToNextWeek, goToCurrentWeek } = useTimeStore();
  const timers = useTimerStore({ tickMs: 15_000 });
  const [category, setCategory] = useState<Category | "all">("all");

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const weekKey = store.selectedWeek || getWeekKey();
  const isCurrentWeek = weekKey === getWeekKey();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TimerBar activities={store.activities} />

      <header className="border-b border-border/60 bg-background sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-2.5 flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> 168
          </Link>
          <div className="flex-1" />
          <Link
            to="/calendar"
            aria-label="Calendario"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendario</span>
          </Link>
          <Link
            to="/todo"
            aria-label="To-Do"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            <CheckSquare className="h-4 w-4" />
            <span className="hidden sm:inline">To-Do</span>
          </Link>
          <SyncBadge />
          <NotificationCenter />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="font-display text-2xl leading-tight">Análisis del tiempo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lo que planificaste y lo que registraste, semana a semana.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousWeek}
            aria-label="Semana anterior"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[200px] text-center">
            <div className="text-sm font-medium">
              {isCurrentWeek ? "Esta semana" : "Semana seleccionada"}
            </div>
            <div className="text-xs text-muted-foreground">{formatWeekRange(weekKey)}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={goToNextWeek} aria-label="Semana siguiente">
            <ArrowRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
              Hoy
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
          <button
            onClick={() => setCategory("all")}
            aria-pressed={category === "all"}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              category === "all"
                ? "bg-foreground text-background border-foreground"
                : "hover:bg-accent"
            }`}
          >
            Todas
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
                category === c.id
                  ? "bg-foreground text-background border-foreground"
                  : "hover:bg-accent"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>

        <TimeInsights
          activities={store.activities}
          timers={timers.data}
          now={timers.now}
          weekKey={weekKey}
          category={category}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
