import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  joinWaitlist,
  leaveWaitlist,
  parseWaitlistInput,
  waitlistStatus,
  type WaitlistDb,
} from "@/lib/pro-waitlist";

/* Server functions for the Pro waitlist. They never touch user_entitlements. */

/** The user's own client (RLS applies), seen through the few calls the waitlist makes. */
const waitlistDb = (client: SupabaseClient<Database>): WaitlistDb => ({
  from: () => {
    const table = client.from("pro_waitlist");
    return {
      insert: (row) => table.insert(row),
      delete: () => ({ eq: (column, value) => table.delete().eq(column, value) }),
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: () => table.select(columns).eq(column, value).maybeSingle(),
        }),
      }),
    };
  },
});

/** Per-user and per-IP limits. */
async function limit(name: string, userId: string, max: number) {
  const { enforce, clientIp, WINDOW_15_MIN } = await import("@/lib/rate-limit.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  enforce(`${name}:u:${userId}`, max, WINDOW_15_MIN);
  enforce(`${name}:ip:${clientIp(getRequest())}`, max * 3, WINDOW_15_MIN);
}

export const joinProWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseWaitlistInput)
  .handler(async ({ data, context }) => {
    await limit("waitlist-join", context.userId, 10);
    // Id and email come from the verified session, never from the input.
    const email = typeof context.claims.email === "string" ? context.claims.email : null;
    const status = await joinWaitlist(
      waitlistDb(context.supabase),
      { userId: context.userId, email },
      data.source,
    );
    return { status };
  });

export const leaveProWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await limit("waitlist-leave", context.userId, 10);
    return { status: await leaveWaitlist(waitlistDb(context.supabase), context.userId) };
  });

export const getProWaitlistStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await limit("waitlist-status", context.userId, 60);
    return { status: await waitlistStatus(waitlistDb(context.supabase), context.userId) };
  });
