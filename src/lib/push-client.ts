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
 * A subscription is only considered active when it belongs to the
 * current VAPID public key.
 * ------------------------------------------------------------------ */

const ENDPOINT_KEY = "week168.push.endpoint";
const VAPID_KEY_KEY = "week168.push.vapidPublicKey";

export type PushState =
  | "unsupported"
  | "signed-out"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const clearStoredPushState = () => {
  try {
    localStorage.removeItem(ENDPOINT_KEY);
    localStorage.removeItem(VAPID_KEY_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export const pushActiveHere = () => {
  try {
    const endpoint = localStorage.getItem(ENDPOINT_KEY);
    const vapidKey = localStorage.getItem(VAPID_KEY_KEY);
    return !!endpoint && !!vapidKey;
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

  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }

  return out;
}

const keyOf = (sub: PushSubscription, name: "p256dh" | "auth") => {
  const raw = sub.getKey(name);

  if (!raw) return "";

  let bin = "";

  for (const b of new Uint8Array(raw)) {
    bin += String.fromCharCode(b);
  }

  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";

  if (Notification.permission === "denied") {
    return "denied";
  }

  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    return "signed-out";
  }

  const { publicKey } = await getVapidPublicKey();

  if (!publicKey) {
    return "not-configured";
  }

  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager.getSubscription();

  const storedVapid = readStored(VAPID_KEY_KEY);
  const storedEndpoint = readStored(ENDPOINT_KEY);

  if (
    !sub ||
    !storedVapid ||
    storedVapid !== publicKey ||
    storedEndpoint !== sub.endpoint
  ) {
    return "off";
  }

  return "on";
}

export async function enableDevicePush(): Promise<PushState> {
  if (!supported()) return "unsupported";

  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    return "signed-out";
  }

  const { publicKey } = await getVapidPublicKey();

  if (!publicKey) {
    return "not-configured";
  }

  const permission = await requestPermission();

  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "off";
  }

  const reg = await ensureServiceWorker();

  if (!reg) {
    return "unsupported";
  }

  let existing = await reg.pushManager.getSubscription();

  const storedVapid = readStored(VAPID_KEY_KEY);
  const storedEndpoint = readStored(ENDPOINT_KEY);

  /*
   * Push subscriptions are tied to the VAPID application server key.
   * If the key changed, the old subscription MUST NOT be reused.
   */
  if (
    existing &&
    (storedVapid !== publicKey ||
      storedEndpoint !== existing.endpoint)
  ) {
    await removePushSubscription({
      data: { endpoint: existing.endpoint },
    }).catch(() => undefined);

    await existing.unsubscribe().catch(() => undefined);

    clearStoredPushState();

    existing = null;
  }

  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: keyOf(sub, "p256dh"),
      auth: keyOf(sub, "auth"),
      timeZone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      userAgent: navigator.userAgent,
    },
  });

  localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
  localStorage.setItem(VAPID_KEY_KEY, publicKey);

  return "on";
}

export async function disableDevicePush(): Promise<PushState> {
  if (!supported()) return "unsupported";

  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager.getSubscription();

  if (sub) {
    await removePushSubscription({
      data: { endpoint: sub.endpoint },
    }).catch(() => undefined);

    await sub.unsubscribe().catch(() => undefined);
  }

  clearStoredPushState();

  return "off";
}

export async function testDevicePush(): Promise<{
  sent: number;
  error?: string;
}> {
  return sendTestPush();
}
