import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GOAL_ICONS, Goal, nextColor } from "@/lib/time-store";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

interface Props {
  initial?: Goal;
  existing: Goal[];
  onCancel: () => void;
  onSubmit: (g: Omit<Goal, "id" | "createdAt">) => void;
}

export function GoalForm({ initial, existing, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? nextColor(existing));
  const [icon, setIcon] = useState(initial?.icon ?? "🎯");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [targetHours, setTargetHours] = useState(initial?.targetHours ?? 10);
  const [active, setActive] = useState(initial?.active ?? true);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({
          name: name.trim(),
          color,
          icon,
          description: description.trim() || undefined,
          targetHours: Math.max(0, targetHours),
          active,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="gname">Nombre</Label>
        <Input
          id="gname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Salud, Estudio, Trabajo…"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>Ícono</Label>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_ICONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className={`h-9 w-9 rounded-lg text-lg transition ${
                icon === e ? "bg-foreground text-background" : "bg-muted hover:bg-accent"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full"
              style={{
                background: c,
                outline: color === c ? "2px solid var(--foreground)" : "none",
                outlineOffset: 2,
              }}
              aria-label={`color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target">Horas objetivo por semana</Label>
        <Input
          id="target"
          type="number"
          min={0}
          max={168}
          step={0.5}
          value={targetHours}
          onChange={(e) => setTargetHours(Number(e.target.value) || 0)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Descripción (opcional)</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="¿Qué representa este objetivo?"
          rows={2}
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 cursor-pointer">
        <Switch checked={active} onCheckedChange={setActive} />
        <div className="flex-1 text-sm">
          <div className="font-medium">Objetivo activo</div>
          <p className="text-xs text-muted-foreground">Los inactivos se ocultan del gráfico.</p>
        </div>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">{initial ? "Guardar" : "Crear objetivo"}</Button>
      </div>
    </form>
  );
}
