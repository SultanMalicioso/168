import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Activity, Goal } from "@/lib/time-store";
import { uid, weeklyHours } from "@/lib/time-store";

interface Props {
  goals: Goal[];
  activities: Activity[];
  onChange: (g: Goal[]) => void;
}

export function GoalsPanel({ goals, activities, onChange }: Props) {
  const [name, setName] = useState("");
  const [hours, setHours] = useState(10);

  const add = () => {
    if (!name.trim()) return;
    onChange([...goals, { id: uid(), activityName: name.trim(), minHours: hours }]);
    setName("");
    setHours(10);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {goals.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin objetivos todavía.</p>
        )}
        {goals.map((g) => {
          const match = activities.find(
            (a) => a.name.toLowerCase() === g.activityName.toLowerCase(),
          );
          const current = match ? weeklyHours(match) : 0;
          const ok = current >= g.minHours;
          const pct = Math.min(100, (current / g.minHours) * 100);
          return (
            <div key={g.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      ok
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ok ? <Check className="h-3 w-3" /> : "!"}
                  </span>
                  <span className="text-sm font-medium truncate">{g.activityName}</span>
                </div>
                <button
                  onClick={() => onChange(goals.filter((x) => x.id !== g.id))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Eliminar objetivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: ok ? "oklch(0.7 0.16 155)" : "var(--foreground)",
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{current.toFixed(1)}h actual</span>
                <span>meta {g.minHours}h</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <Input
          placeholder="Actividad (ej. Dormir)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8"
        />
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 0)}
            className="h-8"
          />
          <Button size="sm" onClick={add} className="shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1" /> Objetivo
          </Button>
        </div>
      </div>
    </div>
  );
}
