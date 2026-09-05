import {
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/lib/push.functions";
import { ensureServiceWorker, requestPermission } from "@/lib/notify-store";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ *
 * Device registration for real server push.
 * The service worker shows the notification even with the app closed,
 * so while this device is registered the in-page engine stops showing
 * OS notifications (the server owns them) to avoid duplicates.
 * ------------------------------------------------------------------ */

const ENDPOINT_KEY = "week168.push.endpoint";

export type PushState =
  | "unsupported"
  | "signed-out"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

export const pushActiveHere = () => {
  try {
    return !!localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return false;
  }
};

const supported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const keyOf = (sub: PushSubscription, name: "p256dh" | "auth") => {
  const raw = sub.getKey(name);
  if (!raw) return "";
  let bin = "";
  for (const b of new Uint8Array(raw)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const { data } = await supabase.auth.getSession();
  if (!data.session) return "signed-out";
  return pushActiveHere() ? "on" : "off";
}

/** Registers this device for server push. Returns the resulting state. */
export async function enableDevicePush(): Promise<PushState> {
  if (!supported()) return "unsupported";

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return "signed-out";

  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) return "not-configured";

  const permission = await requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await ensureServiceWorker();
  if (!reg) return "unsupported";

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: keyOf(sub, "p256dh"),
      auth: keyOf(sub, "auth"),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      userAgent: navigator.userAgent,
    },
  });

  localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
  return "on";
}

export async function disableDevicePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager.getSubscription();

  if (sub) {
    await removePushSubscription({ data: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }

  localStorage.removeItem(ENDPOINT_KEY);
  return "off";
}

export async function testDevicePush(): Promise<{ sent: number; error?: string }> {
  return sendTestPush();
}
