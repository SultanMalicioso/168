import {
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/lib/push.functions";
import { ensureServiceWorker, requestPermission } from "@/lib/notify-store";
import { supabase } from "@/integrations/supabase/client";
import { base64UrlToBytes, bytesToBase64Url, isValidP256PublicKey, sameBytes } from "@/lib/vapid";

/* ------------------------------------------------------------------ *
 * Device registration for real server push.
 * A subscription is only considered active when it belongs to the
 * current VAPID public key.
 * ------------------------------------------------------------------ */

const ENDPOINT_KEY = "week168.push.endpoint";
const VAPID_KEY_KEY = "week168.push.vapidPublicKey";

export type PushState = "unsupported" | "signed-out" | "not-configured" | "denied" | "off" | "on";

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

/**
 * Converts the server's Base64URL VAPID key into the raw 65-byte P-256
 * point `pushManager.subscribe()` expects, and rejects anything that is
 * not a valid point with a readable message instead of the browser's
 * "applicationServerKey must contain a valid P-256 public key".
 */
function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64UrlToBytes(publicKey);
  } catch {
    throw new Error("La clave VAPID pública no es Base64URL válido");
  }

  if (!isValidP256PublicKey(bytes)) {
    throw new Error(
      `La clave VAPID pública no es una clave P-256 válida (${bytes.length} bytes). Revisá VAPID_PRIVATE_KEY en el servidor.`,
    );
  }

  return bytes;
}

/**
 * true when the subscription was created with `serverKey`. Browsers
 * expose the key the subscription was made with in
 * `options.applicationServerKey`; older ones only let us compare with
 * the key we remembered when subscribing.
 */
function belongsToKey(sub: PushSubscription, serverKey: Uint8Array, publicKey: string): boolean {
  const used = sub.options?.applicationServerKey;

  if (used && used.byteLength > 0) {
    return sameBytes(new Uint8Array(used), serverKey);
  }

  return readStored(VAPID_KEY_KEY) === publicKey;
}

const keyOf = (sub: PushSubscription, name: "p256dh" | "auth") => {
  const raw = sub.getKey(name);
  return raw ? bytesToBase64Url(new Uint8Array(raw)) : "";
};

/** Drops a subscription made with an old VAPID key, here and in Supabase. */
async function discard(sub: PushSubscription) {
  await removePushSubscription({
    data: { endpoint: sub.endpoint },
  }).catch(() => undefined);

  await sub.unsubscribe().catch(() => undefined);

  clearStoredPushState();
}

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

  if (!sub || Notification.permission !== "granted") {
    return "off";
  }

  let serverKey: Uint8Array;
  try {
    serverKey = applicationServerKey(publicKey);
  } catch {
    return "not-configured";
  }

  if (!belongsToKey(sub, serverKey, publicKey) || readStored(ENDPOINT_KEY) !== sub.endpoint) {
    return "off";
  }

  return "on";
}

export async function enableDevicePush(): Promise<PushState> {
  if (!supported()) return "unsupported";

  /*
   * Ask first: iOS only shows the prompt while the tap that triggered it
   * is still "fresh", so no network round trip may come before it.
   */
  const permission = await requestPermission();

  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "off";
  }

  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    return "signed-out";
  }

  const { publicKey } = await getVapidPublicKey();

  if (!publicKey) {
    return "not-configured";
  }

  const serverKey = applicationServerKey(publicKey);

  const reg = await ensureServiceWorker();

  if (!reg) {
    return "unsupported";
  }

  let existing = await reg.pushManager.getSubscription();

  /*
   * Push subscriptions are tied to the VAPID application server key.
   * One created with another key can never receive our pushes, so it
   * is removed and replaced instead of being reused.
   */
  if (existing && !belongsToKey(existing, serverKey, publicKey)) {
    await discard(existing);
    existing = null;
  }

  const subscribe = () =>
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    });

  let sub: PushSubscription;

  if (existing) {
    sub = existing;
  } else {
    try {
      sub = await subscribe();
    } catch (error) {
      /* A leftover subscription with another key blocks subscribe(). */
      const stale = await reg.pushManager.getSubscription();
      if (!stale) throw error;
      await discard(stale);
      sub = await subscribe();
    }
  }

  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: keyOf(sub, "p256dh"),
      auth: keyOf(sub, "auth"),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      userAgent: navigator.userAgent,
    },
  });

  const previousEndpoint = readStored(ENDPOINT_KEY);
  if (previousEndpoint && previousEndpoint !== sub.endpoint) {
    await removePushSubscription({
      data: { endpoint: previousEndpoint },
    }).catch(() => undefined);
  }

  try {
    localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
    localStorage.setItem(VAPID_KEY_KEY, publicKey);
  } catch {
    // Ignore storage failures.
  }

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
