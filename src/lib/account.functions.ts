import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Permanently deletes the signed-in user's account and every row they own. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enforce, clientIp, WINDOW_15_MIN } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    enforce(`account-delete:u:${context.userId}`, 3, WINDOW_15_MIN);
    enforce(`account-delete:ip:${clientIp(getRequest())}`, 10, WINDOW_15_MIN);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    for (const table of ["user_data", "push_subscriptions", "push_sent"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
      if (error) {
        console.error(`account delete [${table}]: ${error.message}`);
        throw new Error("No pudimos eliminar tus datos. Probá de nuevo.");
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`account delete [auth]: ${error.message}`);
      throw new Error("No pudimos eliminar la cuenta. Probá de nuevo.");
    }

    return { ok: true };
  });
