import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planAllows, resolvePlan, type Feature, type Plan } from "@/lib/plan";

/*
 * Server-side plan checks. Any server function that offers a Pro feature
 * must call `requireFeature` itself: the client's view of the plan is never
 * proof of anything.
 */

export async function getUserPlan(client: SupabaseClient<Database>, userId: string): Promise<Plan> {
  const { data, error } = await client
    .from("user_entitlements")
    .select("plan, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("No pudimos verificar tu plan.");
  return resolvePlan(data);
}

export async function requireFeature(
  client: SupabaseClient<Database>,
  userId: string,
  feature: Feature,
): Promise<void> {
  if (!planAllows(await getUserPlan(client, userId), feature)) {
    throw new Error("Esta función es parte de 168 Pro.");
  }
}
