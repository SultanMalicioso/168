/* ------------------------------------------------------------------ *
 * Plans and features: the single place that decides what each plan can
 * use. Components ask `can(feature)` (see usePlan); they never check the
 * plan themselves.
 *
 *   user → entitlement row (Supabase) → plan → features
 *
 * The entitlement row is written only by the server (today by hand, later
 * by a billing webhook), so the client can read its plan but never set it.
 * ------------------------------------------------------------------ */

export type Plan = "free" | "pro";

export const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro" };

interface FeatureDef {
  /** Lowest plan that includes the feature. */
  plan: Plan;
  title: string;
  description: string;
}

/**
 * Everything not listed here is part of the core app and free for everyone
 * (planning, activities, timer, conflicts, basic goals and history…).
 * To make something Pro, add it here and wrap its UI in <ProGate>.
 */
export const FEATURES = {
  "stats.advanced": {
    plan: "pro",
    title: "Análisis avanzado del tiempo",
    description:
      "Planificado vs real por categoría, distribución del tiempo registrado, comparación entre semanas y evolución.",
  },
  "goals.advanced": {
    plan: "pro",
    title: "Seguimiento avanzado de objetivos",
    description:
      "Planificado vs realizado, horas restantes y diferencia de cada objetivo, con el detalle por actividad.",
  },
} as const satisfies Record<string, FeatureDef>;

export type Feature = keyof typeof FEATURES;

const RANK: Record<Plan, number> = { free: 0, pro: 1 };

export const planAllows = (plan: Plan, feature: Feature): boolean =>
  RANK[plan] >= RANK[FEATURES[feature].plan];

/** Shape of a `user_entitlements` row, as far as the plan is concerned. */
export interface EntitlementRow {
  plan: string;
  expires_at: string | null;
}

/** No row, an unknown plan or an expired one all mean Free. */
export function resolvePlan(row: EntitlementRow | null | undefined, now = Date.now()): Plan {
  if (!row || row.plan !== "pro") return "free";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "free";
  return "pro";
}

/* ---------------- development only ---------------- */

/*
 * Lets developers preview Free or Pro locally. It only exists in dev builds
 * (`import.meta.env.DEV`): production code ignores it entirely, so it can
 * never unlock anything for real users.
 */
const DEV_KEY = "week168.dev.plan";
export const DEV_PLAN_EVENT = "week168:dev-plan";
export const devToolsEnabled = (): boolean => import.meta.env?.DEV === true;

export function getDevPlanOverride(): Plan | null {
  if (!devToolsEnabled()) return null;
  try {
    const v = localStorage.getItem(DEV_KEY);
    return v === "free" || v === "pro" ? v : null;
  } catch {
    return null;
  }
}

export function setDevPlanOverride(plan: Plan | null) {
  if (!devToolsEnabled()) return;
  try {
    if (plan) localStorage.setItem(DEV_KEY, plan);
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(DEV_PLAN_EVENT));
}
