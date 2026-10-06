import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  joinWaitlist,
  leaveWaitlist,
  parseWaitlistInput,
  waitlistStatus,
  type WaitlistDb,
} from "@/lib/pro-waitlist";

/* Server functions for the Pro waitlist. They never touch user_entitlements. */

/**
 * The user's own client (RLS applies). `pro_waitlist` isn't in the
 * generated types yet: regenerate src/integrations/supabase/types.ts after
 * running its SQL, then this cast can go.
 */
const waitlistDb = (client: unknown) => client as WaitlistDb;

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
