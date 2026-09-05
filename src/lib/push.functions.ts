import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Server functions backing device push registration. */

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => ({
  publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null,
}));

interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  timeZone: string;
  userAgent?: string;
}

const validate = (input: SubscriptionInput): SubscriptionInput => {
  if (!input?.endpoint?.startsWith("https://")) throw new Error("Endpoint inválido");
  if (!input.p256dh || !input.auth) throw new Error("Claves de push faltantes");
  return {
    endpoint: input.endpoint.slice(0, 2000),
    p256dh: input.p256dh.slice(0, 500),
    auth: input.auth.slice(0, 500),
    timeZone: (input.timeZone || "UTC").slice(0, 64),
    userAgent: input.userAgent?.slice(0, 300),
  };
};

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        time_zone: data.timeZone,
        user_agent: data.userAgent ?? null,
        enabled: true,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => ({ endpoint: String(input.endpoint ?? "") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendWebPush, readVapid } = await import("@/lib/web-push.server");
    const vapid = readVapid();
    if (!vapid) return { sent: 0, error: "Push sin configurar" };

    const { data: subs } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", context.userId)
      .eq("enabled", true);

    if (!subs?.length) return { sent: 0, error: "Este dispositivo no está registrado" };

    let sent = 0;
    for (const sub of subs) {
      const res = await sendWebPush(
        sub,
        {
          title: "🔔 Prueba de aviso",
          body: "Los avisos llegan aunque la app esté cerrada.",
          tag: "test",
          link: "/",
        },
        vapid,
      );
      if (res.ok) sent++;
    }
    return { sent };
  });
