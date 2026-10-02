import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";

/* Server functions backing device push registration. */

/**
 * The public key handed to `pushManager.subscribe()`. It is derived from
 * VAPID_PRIVATE_KEY on the server, so it always matches the key that
 * signs the pushes (see readVapid).
 */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const { readVapid } = await import("@/lib/web-push.server");
  return { publicKey: readVapid()?.publicKey ?? null };
});

interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  timeZone: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Rejects (never truncates) malformed or oversized input. */
const validate = (input: unknown): SubscriptionInput => {
  if (!isObject(input)) throw new Error("Datos inválidos");
  const { endpoint, p256dh, auth, timeZone } = input;

  if (typeof endpoint !== "string" || endpoint.length > 1000) {
    throw new Error("Endpoint inválido");
  }
  if (!isAllowedPushEndpoint(endpoint)) {
    throw new Error("Endpoint inválido");
  }

  // p256dh: 65-byte P-256 point (87 chars); auth: 16-byte secret (22 chars).
  if (typeof p256dh !== "string" || !B64URL.test(p256dh) || p256dh.length !== 87) {
    throw new Error("Clave p256dh inválida");
  }
  if (typeof auth !== "string" || !B64URL.test(auth) || auth.length < 16 || auth.length > 64) {
    throw new Error("Clave auth inválida");
  }

  let tz = "UTC";
  if (typeof timeZone === "string" && timeZone.length <= 64) {
    try {
      tz = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    } catch {
      throw new Error("Zona horaria inválida");
    }
  }

  return {
    endpoint,
    p256dh,
    auth,
    timeZone: tz,
  };
};

/** Per-user and per-IP limits for the push server functions. */
async function limit(name: string, userId: string, max: number) {
  const { enforce, clientIp, WINDOW_15_MIN } = await import("@/lib/rate-limit.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  enforce(`${name}:u:${userId}`, max, WINDOW_15_MIN);
  enforce(`${name}:ip:${clientIp(getRequest())}`, max * 3, WINDOW_15_MIN);
}

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    await limit("push-save", context.userId, 20);
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        time_zone: data.timeZone,
        user_agent: null,
        enabled: true,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const endpoint = isObject(input) ? input.endpoint : null;
    if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) {
      throw new Error("Endpoint inválido");
    }
    return { endpoint };
  })
  .handler(async ({ data, context }) => {
    await limit("push-remove", context.userId, 20);
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await limit("push-test", context.userId, 5);
    const { sendWebPush, readVapid } = await import("@/lib/web-push.server");

    const vapid = readVapid();

    if (!vapid) {
      return {
        sent: 0,
        error: "Push sin configurar",
      };
    }

    const { data: subs, error: subsError } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", context.userId)
      .eq("enabled", true);

    if (subsError) {
      console.error("[push-test] subscriptions read failed", subsError.message);
      return {
        sent: 0,
        error: "No pudimos leer tus dispositivos",
      };
    }

    if (!subs?.length) {
      return {
        sent: 0,
        error: "Este dispositivo no está registrado",
      };
    }

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      try {
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

        if (res.ok) {
          sent++;
        } else if (res.expired) {
          /* The push service says this endpoint is gone: stop using it. */
          await context.supabase
            .from("push_subscriptions")
            .update({ enabled: false })
            .eq("endpoint", sub.endpoint)
            .eq("user_id", context.userId);
          errors.push(`${res.status}: suscripción vencida, volvé a activar los avisos`);
        } else {
          /* Never relay the remote response: only the status code. */
          console.error(`[push-test] push service ${res.status}: ${res.body ?? ""}`);
          errors.push(`${res.status ?? "error"}: el servicio de avisos rechazó la notificación`);
        }
      } catch (error) {
        errors.push("No pudimos contactar al servicio de avisos");
        console.error("[push-test] sendWebPush exception", error);
      }
    }

    if (sent === 0 && errors.length > 0) {
      return {
        sent: 0,
        error: errors.join(" | "),
      };
    }

    if (errors.length > 0) {
      return {
        sent,
        error: errors.join(" | "),
      };
    }

    return { sent };
  });
