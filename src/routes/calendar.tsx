import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckSquare } from "lucide-react";
import { CalendarModule } from "@/components/calendar/CalendarModule";
import { useTimeStore } from "@/lib/time-store";
import { useTimerStore } from "@/lib/timer-store";
import { SyncBadge } from "@/components/sync/SyncBadge";
import { TimerBar } from "@/components/time/TimerBar";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendario de progreso · 168" },
      {
        name: "description",
        content:
          "Historial diario de cumplimiento con vistas de semana, mes y año: rachas, porcentajes y estadísticas de constancia.",
      },
      { property: "og:title", content: "Calendario de progreso · 168" },
      {
        property: "og:description",
        content:
          "Seguimiento diario automático: días completados, rachas y evolución en vistas de semana, mes y año.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { store } = useTimeStore();
  const timers = useTimerStore();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TimerBar activities={store.activities} />

      <header className="border-b border-border/60 backdrop-blur-xl bg-background/85 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-2.5 flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> 168
          </Link>
          <div className="flex-1" />
          <Link
            to="/todo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            <CheckSquare className="h-4 w-4" /> To-Do
          </Link>
          <SyncBadge />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl leading-tight">Calendario de progreso</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tu cumplimiento diario, calculado automáticamente a partir de las actividades,
            temporizadores y tareas.
          </p>
        </div>

        <CalendarModule
          activities={store.activities}
          goals={store.goals}
          tasks={store.tasks}
          timers={timers.data}
          now={timers.now}
        />
      </main>
    </div>
  );
}
