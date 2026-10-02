import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, formatDuration, type Activity, type Category } from "@/lib/time-store";
import type { TimerData } from "@/lib/timer-store";
import {
  activitiesInWeek,
  averageOfWeeks,
  computeWeekStats,
  weekKeysEndingAt,
} from "@/lib/time-stats";
import { addWeeks, weekKeyToDate } from "@/lib/week-utils";

interface Props {
  activities: Activity[];
  timers: TimerData;
  now: number;
  weekKey: string;
  /** The dashboard's category filter. */
  category: Category | "all";
}

const PERIODS = [4, 8, 12] as const;

const signed = (h: number) =>
  Math.abs(h) < 1 / 120 ? "0 min" : `${h > 0 ? "+" : "-"}${formatDuration(Math.abs(h))}`;

const diffClass = (h: number) =>
  Math.abs(h) < 1 / 120
    ? "text-muted-foreground"
    : h > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-amber-700 dark:text-amber-400";

const shortWeek = (key: string) =>
  weekKeyToDate(key).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });

export function TimeInsights({ activities, timers, now, weekKey, category }: Props) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(4);
  const [activityId, setActivityId] = useState<string>("all");

  const weekOptions = useMemo(
    () =>
      activitiesInWeek(activities, weekKey).filter(
        (a) => category === "all" || a.category === category,
      ),
    [activities, weekKey, category],
  );
  const activeActivity = weekOptions.some((a) => a.id === activityId) ? activityId : "all";
  const filter = { category, activityId: activeActivity };

  const history = useMemo(
    () =>
      weekKeysEndingAt(weekKey, period + 1).map((k) =>
        computeWeekStats(activities, timers, k, now, filter),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, timers, now, weekKey, period, category, activeActivity],
  );
  const week = history[history.length - 1];
  const prev = history[history.length - 2];
  const previous = history.slice(0, -1);
  const average = averageOfWeeks(previous);
  const shown = history.slice(1);

  const diff = week.real - week.planned;
  const topCategory = week.categories.find((c) => c.real > 0);
  const topActivity = week.activities.find((a) => a.real > 0);
  const biggestGap = [...week.categories]
    .filter((c) => Math.abs(c.real - c.planned) >= 1 / 60)
    .sort((x, y) => Math.abs(y.real - y.planned) - Math.abs(x.real - x.planned))[0];

  const compareRows = CATEGORIES.map((c) => ({
    ...c,
    now: week.categories.find((x) => x.category === c.id)?.real ?? 0,
    before: prev.categories.find((x) => x.category === c.id)?.real ?? 0,
    avg: average?.byCategory.get(c.id) ?? 0,
  })).filter((r) => r.now > 0 || r.before > 0 || r.avg > 0);

  const weeksWithData = shown.filter((w) => w.real > 0).length;
  const maxBar = Math.max(1, ...shown.map((w) => Math.max(w.planned, w.real)));

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as 4 | 8 | 12)}>
            <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Últimas {p} semanas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeActivity} onValueChange={setActivityId}>
            <SelectTrigger className="h-8 w-[10rem] text-xs" aria-label="Actividad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las actividades</SelectItem>
              {weekOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weekly report */}
      <section aria-labelledby="ti-summary">
        <h3
          id="ti-summary"
          className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2"
        >
          Resumen semanal
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Tile label="Planificado" value={formatDuration(week.planned)} />
          <Tile label="Registrado" value={formatDuration(week.real)} />
          <Tile label="Diferencia" value={signed(diff)} className={diffClass(diff)} />
          {topCategory && (
            <Tile
              label="Categoría con más tiempo"
              value={topCategory.label}
              sub={formatDuration(topCategory.real)}
            />
          )}
          {topActivity && (
            <Tile
              label="Actividad con más tiempo"
              value={topActivity.name}
              sub={formatDuration(topActivity.real)}
            />
          )}
          {biggestGap && week.real > 0 && (
            <Tile
              label="Mayor diferencia"
              value={biggestGap.label}
              sub={signed(biggestGap.real - biggestGap.planned)}
            />
          )}
        </div>
      </section>

      {/* Planned vs real by category */}
      <section aria-labelledby="ti-categories">
        <h3
          id="ti-categories"
          className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2"
        >
          Planificado vs real por categoría
        </h3>
        {week.categories.length === 0 ? (
          <Empty>No hay actividades en esta semana.</Empty>
        ) : (
          <CompareTable
            columns={["Plan", "Real", "Dif."]}
            rows={week.categories.map((c) => ({
              key: c.category,
              label: c.label,
              color: c.color,
              values: [
                formatDuration(c.planned),
                formatDuration(c.real),
                signed(c.real - c.planned),
              ],
              lastClass: diffClass(c.real - c.planned),
            }))}
          />
        )}
      </section>

      {/* Real distribution */}
      <section aria-labelledby="ti-dist">
        <h3
          id="ti-dist"
          className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2"
        >
          Distribución del tiempo registrado
        </h3>
        {week.real <= 0 ? (
          <Empty>Todavía no hay tiempo registrado en esta semana.</Empty>
        ) : (
          <div className="space-y-4">
            <Bars
              rows={week.categories
                .filter((c) => c.real > 0)
                .map((c) => ({ key: c.category, label: c.label, color: c.color, hours: c.real }))}
              total={week.real}
            />
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Por actividad</p>
              <Bars
                rows={week.activities
                  .filter((a) => a.real > 0)
                  .map((a) => ({ key: a.id, label: a.name, color: a.color, hours: a.real }))}
                total={week.real}
              />
            </div>
          </div>
        )}
      </section>

      {/* Week comparison */}
      <section aria-labelledby="ti-compare">
        <h3
          id="ti-compare"
          className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2"
        >
          Comparación con semanas anteriores
        </h3>
        {prev.real <= 0 && !average ? (
          <Empty>Todavía no hay suficientes datos para comparar semanas.</Empty>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Tile
                label={`vs semana del ${shortWeek(addWeeks(weekKey, -1))}`}
                value={prev.real > 0 ? signed(week.real - prev.real) : "Sin datos"}
                sub={prev.real > 0 ? `antes ${formatDuration(prev.real)}` : undefined}
                className={
                  prev.real > 0 ? diffClass(week.real - prev.real) : "text-muted-foreground"
                }
              />
              <Tile
                label={average ? `vs promedio (${average.weeks} sem.)` : "vs promedio"}
                value={average ? signed(week.real - average.real) : "Sin datos"}
                sub={average ? `promedio ${formatDuration(average.real)}` : undefined}
                className={average ? diffClass(week.real - average.real) : "text-muted-foreground"}
              />
            </div>
            {compareRows.length > 0 && (
              <CompareTable
                columns={["Esta", "Anterior", "Dif."]}
                rows={compareRows.map((r) => ({
                  key: r.id,
                  label: r.label,
                  color: r.color,
                  values: [
                    formatDuration(r.now),
                    prev.real > 0 ? formatDuration(r.before) : "—",
                    prev.real > 0 ? signed(r.now - r.before) : "—",
                  ],
                  lastClass: prev.real > 0 ? diffClass(r.now - r.before) : "text-muted-foreground",
                }))}
              />
            )}
          </div>
        )}
      </section>

      {/* Evolution */}
      <section aria-labelledby="ti-evolution">
        <h3
          id="ti-evolution"
          className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2"
        >
          Evolución semanal
        </h3>
        {weeksWithData < 2 ? (
          <Empty>
            Todavía no hay suficientes semanas con tiempo registrado para ver la evolución.
          </Empty>
        ) : (
          <div>
            <div
              className="flex items-end gap-1.5 h-40"
              role="img"
              aria-label="Horas planificadas y registradas por semana"
            >
              {shown.map((w) => (
                <div
                  key={w.weekKey}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end"
                >
                  <div className="relative w-full flex-1 flex items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 max-w-4 rounded-t bg-muted-foreground/25"
                      style={{ height: `${(w.planned / maxBar) * 100}%` }}
                      title={`Planificado: ${formatDuration(w.planned)}`}
                    />
                    <div
                      className={`w-1/2 max-w-4 rounded-t ${w.weekKey === weekKey ? "bg-foreground" : "bg-foreground/60"}`}
                      style={{ height: `${(w.real / maxBar) * 100}%` }}
                      title={`Registrado: ${formatDuration(w.real)}`}
                    />
                  </div>
                  <span
                    className={`text-[9px] tabular-nums ${w.weekKey === weekKey ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                  >
                    {shortWeek(w.weekKey)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/25" /> Planificado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-foreground" /> Registrado
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl border p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">
        {label}
      </div>
      <div className={`font-display text-xl mt-1 leading-tight truncate ${className}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function CompareTable({
  columns,
  rows,
}: {
  columns: [string, string, string];
  rows: { key: string; label: string; color: string; values: string[]; lastClass: string }[];
}) {
  return (
    <div className="rounded-2xl border overflow-hidden text-sm">
      <div className="hidden sm:grid grid-cols-[1fr_6.5rem_6.5rem_6.5rem] gap-x-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Categoría</span>
        {columns.map((c) => (
          <span key={c} className="text-right">
            {c}
          </span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className={`px-3 py-2 sm:grid sm:grid-cols-[1fr_6.5rem_6.5rem_6.5rem] sm:gap-x-3 sm:items-center tabular-nums ${i > 0 ? "border-t" : "sm:border-t"}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="truncate font-medium sm:font-normal">{r.label}</span>
          </span>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:contents">
            {r.values.map((v, j) => (
              <span key={j} className={`text-xs sm:text-right ${j === 2 ? r.lastClass : ""}`}>
                <span className="block text-[9px] uppercase tracking-wider text-muted-foreground sm:hidden">
                  {columns[j]}
                </span>
                {v}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bars({
  rows,
  total,
}: {
  rows: { key: string; label: string; color: string; hours: number }[];
  total: number;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = (r.hours / total) * 100;
        return (
          <li key={r.key} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: r.color }}
                />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDuration(r.hours)} · {Math.round(pct)} %
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: r.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}
