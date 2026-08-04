import { useMemo, useRef, useState } from "react";
import { Plus, Sparkles, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/time-store";
import { describeParsed, parseQuickTask, type ParsedTask } from "@/lib/task-parse";

export function QuickAdd({
  store,
  defaults,
  onCreate,
  onOpenFull,
}: {
  store: Store;
  /** Preset applied when the text doesn't specify it (e.g. current view = Hoy). */
  defaults?: Partial<ParsedTask>;
  onCreate: (parsed: ParsedTask) => void;
  onOpenFull: (parsed: ParsedTask) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(
    () => parseQuickTask(value, store.activities, store.goals),
    [value, store.activities, store.goals],
  );
  const chips = useMemo(
    () => describeParsed(parsed, store.activities, store.goals),
    [parsed, store.activities, store.goals],
  );

  const merged = (): ParsedTask => ({ ...defaults, ...parsed });

  const submit = () => {
    if (!parsed.name.trim()) return;
    onCreate(merged());
    setValue("");
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-2xl border bg-card p-2 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setValue("");
          }}
          placeholder="Nueva tarea… probá: Estudiar #Estudio !alta ~90m mañana 18:00"
          className="h-10 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir editor completo"
          onClick={() => {
            onOpenFull(merged());
            setValue("");
          }}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={submit} disabled={!parsed.name.trim()}>
          Añadir
        </Button>
      </div>
      {value.trim() !== "" && (
        <div className="flex items-center gap-1.5 flex-wrap px-2 pb-1 pt-1.5 animate-fade-in">
          <Sparkles className="h-3 w-3 text-muted-foreground" />
          {chips.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              #actividad · @objetivo · !alta · ~90m · hoy / mañana / 24/08 · 18:00 · +etiqueta
            </span>
          ) : (
            chips.map((c) => (
              <span
                key={c}
                className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
              >
                {c}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}
