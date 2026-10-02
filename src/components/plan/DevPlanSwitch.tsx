import { useEffect, useState } from "react";
import { DEV_PLAN_EVENT, getDevPlanOverride, setDevPlanOverride, type Plan } from "@/lib/plan";

/**
 * Development-only control to preview the app as Free or Pro. Production
 * builds drop it entirely (the check is replaced at build time), and the
 * override itself is ignored there anyway.
 */
export function DevPlanSwitch() {
  return import.meta.env.DEV ? <PlanSwitch /> : null;
}

function PlanSwitch() {
  const [value, setValue] = useState<Plan | null>(null);

  useEffect(() => {
    const sync = () => setValue(getDevPlanOverride());
    sync();
    window.addEventListener(DEV_PLAN_EVENT, sync);
    return () => window.removeEventListener(DEV_PLAN_EVENT, sync);
  }, []);

  const options: { id: Plan | null; label: string }[] = [
    { id: null, label: "Real" },
    { id: "free", label: "Free" },
    { id: "pro", label: "Pro" },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-dashed p-4 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Solo desarrollo · plan simulado
      </p>
      <div className="inline-flex rounded-full border bg-muted/40 p-1 text-xs">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => setDevPlanOverride(o.id)}
            className={`rounded-full px-3 py-1 transition ${
              value === o.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
