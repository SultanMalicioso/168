import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCloudSync } from "@/lib/cloud-sync";
import {
  DEV_PLAN_EVENT,
  getDevPlanOverride,
  planAllows,
  resolvePlan,
  type Feature,
  type Plan,
} from "@/lib/plan";

export interface PlanState {
  plan: Plan;
  isPro: boolean;
  /** True until the plan is known (session check + entitlement read). */
  loading: boolean;
  /** A dev-only override is active (never in production builds). */
  simulated: boolean;
  can: (feature: Feature) => boolean;
}

/** The current user's plan. Signed-out users are Free. */
export function usePlan(): PlanState {
  const { user, authChecked } = useCloudSync();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["entitlement", userId],
    enabled: userId !== null,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Plan> => {
      const { data, error } = await supabase
        .from("user_entitlements")
        .select("plan, expires_at")
        .maybeSingle();
      if (error) throw error;
      return resolvePlan(data);
    },
  });

  const [devPlan, setDevPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sync = () => setDevPlan(getDevPlanOverride());
    sync();
    window.addEventListener(DEV_PLAN_EVENT, sync);
    return () => window.removeEventListener(DEV_PLAN_EVENT, sync);
  }, []);

  // A failed read falls back to Free: never grant Pro without a confirmed row.
  const realPlan: Plan = userId ? (query.data ?? "free") : "free";
  const plan = devPlan ?? realPlan;
  const loading = devPlan === null && (!authChecked || (userId !== null && query.isPending));

  const can = useCallback((feature: Feature) => planAllows(plan, feature), [plan]);

  return { plan, isPro: plan === "pro", loading, simulated: devPlan !== null, can };
}
