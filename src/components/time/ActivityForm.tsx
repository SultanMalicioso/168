import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, type Activity, type Category } from "@/lib/time-store";

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
  initial?: Activity;
  defaultColor: string;
  onCancel: () => void;
  onSubmit: (a: Omit<Activity, "id">) => void;
}

export function ActivityForm({ initial, defaultColor, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hoursPerDay, setHoursPerDay] = useState(initial?.hoursPerDay ?? 1);
  const [daysPerWeek, setDaysPerWeek] = useState(initial?.daysPerWeek ?? 5);
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [category, setCategory] = useState<Category>(initial?.category ?? "otro");

  useEffect(() => {
    if (!initial) setColor(defaultColor);
  }, [defaultColor, initial]);

  const weekly = hoursPerDay * daysPerWeek;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), hoursPerDay, daysPerWeek, color, category });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dormir, Trabajo, Gimnasio…"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="hpd">Horas por día</Label>
          <Input
            id="hpd"
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dpw">Días por semana</Label>
          <Input
            id="dpw"
            type="number"
            min={0}
            max={7}
            step={1}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Math.max(0, Math.min(7, Number(e.target.value) || 0)))}
          />
        </div>
      </div>

      <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total semanal</span>{" "}
        <span className="font-semibold">{weekly.toFixed(2)} h</span>
      </div>

      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger>
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

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition-all"
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">{initial ? "Guardar" : "Agregar"}</Button>
      </div>
    </form>
  );
}
