import { useCallback, useEffect, useState } from "react";
import {
  CLOUD_UPDATED_EVENT,
  LOCAL_DATA_CHANGED_EVENT,
} from "@/lib/cloud-sync";

/* ------------------------------------------------------------------ *
 * Notification store
 * Settings + in-app notification center + dedupe ledger.
 * Delivery uses the real Notification API (service worker when
 * available) — never a fake in-page toast.
 * ------------------------------------------------------------------ */

export const NOTIFY_KEY = "week168.notify.v1";

export type NotifyKind = "activity" | "task" | "summary" | "system";

export interface NotifyItem {
  id: string;
  kind: NotifyKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
  color?: string;
  activityId?: string;
  taskId?: string;
  /** In-app route to open when the notification is clicked. */
  link?: string;
  /** true when the OS notification was suppressed (quiet hours / no permission). */
  silent?: boolean;
}

export interface NotifySettings {
  enabled: boolean;
  morning: boolean;
  morningTime: string; // HH:mm
  night: boolean;
  nightTime: string; // HH:mm
  activities: boolean;
  tasks: boolean;
  pendingTasks: boolean;
  completions: boolean;
  quietEnabled: boolean;
  quietFrom: string; // HH:mm — start of the "do not disturb" window
  quietTo: string; // HH:mm
  /** Default lead time in minutes for reminders. */
  defaultLead: number;
}

export interface NotifyData {
  settings: NotifySettings;
  items: NotifyItem[];
  /** dedupeKey → epoch ms, so an event is never fired twice. */
  sent: Record<string, number>;
}

export const LEAD_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

export const leadLabel = (m: number) =>
  m === 0 ? "Sin recordatorio" : m >= 60 ? "1 hora antes" : `${m} minutos antes`;

const DEFAULT_SETTINGS: NotifySettings = {
  enabled: true,
  morning: true,
  morningTime: "08:00",
  night: true,
  nightTime: "21:30",
  activities: true,
  tasks: true,
  pendingTasks: true,
  completions: true,
  quietEnabled: true,
  quietFrom: "23:00",
  quietTo: "07:00",
  defaultLead: 10,
};

const DEFAULT: NotifyData = { settings: DEFAULT_SETTINGS, items: [], sent: {} };

const MAX_ITEMS = 120;
const SENT_TTL = 7 * 24 * 3_600_000;

let memory: NotifyData = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): NotifyData {
  const r = (raw ?? {}) as Partial<NotifyData>;
  return {
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
    items: Array.isArray(r.items) ? r.items.slice(0, MAX_ITEMS) : [],
    sent: r.sent && typeof r.sent === "object" ? (r.sent as Record<string, number>) : {},
  };
}

export function loadNotify(): NotifyData {
  if (loaded) return memory;
  loaded = true;
  if (typeof window === "undefined") return memory;
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (raw) memory = sanitize(JSON.parse(raw));
  } catch {
    /* corrupted payload */
  }
  return memory;
}

/** Always reads the freshest snapshot (used by the engine after cloud pulls). */
export const notifyData = () => loadNotify();

export function commitNotify(next: NotifyData) {
  const now = Date.now();
  const sent: Record<string, number> = {};
  for (const [k, v] of Object.entries(next.sent)) {
    if (now - v < SENT_TTL) sent[k] = v;
  }

  memory = { ...next, sent, items: next.items.slice(0, MAX_ITEMS) };

  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(memory));
  } catch {
    /* quota */
  }

  listeners.forEach((l) => l());

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LOCAL_DATA_CHANGED_EVENT, { detail: { key: NOTIFY_KEY } }),
    );
  }
}

export function updateNotify(fn: (d: NotifyData) => NotifyData) {
  commitNotify(fn(loadNotify()));
}

function reloadFromStorage() {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    memory = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    memory = DEFAULT;
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === NOTIFY_KEY) reloadFromStorage();
  });
  window.addEventListener(CLOUD_UPDATED_EVENT, reloadFromStorage);
}

/* ---------------- permission + delivery ---------------- */

export type PermissionState = "unsupported" | "default" | "granted" | "denied";

export function permissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

let swReady: Promise<ServiceWorkerRegistration | null> | null = null;

export function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!swReady) {
    swReady = navigator.serviceWorker
      .register("/sw-notify.js")
      .then((reg) => navigator.serviceWorker.ready.then(() => reg))
      .catch(() => null);
  }
  return swReady;
}

export async function requestPermission(): Promise<PermissionState> {
  if (permissionState() === "unsupported") return "unsupported";
  if (Notification.permission === "granted") {
    await ensureServiceWorker();
    return "granted";
  }
  const result = await Notification.requestPermission();
  if (result === "granted") await ensureServiceWorker();
  return result as PermissionState;
}

const hhmmToMin = (v: string) => {
  const [h, m] = v.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export function inQuietHours(s: NotifySettings, date = new Date()): boolean {
  if (!s.quietEnabled) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = hhmmToMin(s.quietFrom);
  const to = hhmmToMin(s.quietTo);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export interface NotifyInput {
  kind: NotifyKind;
  title: string;
  body: string;
  color?: string;
  activityId?: string;
  taskId?: string;
  link?: string;
  /** Replaces any pending OS notification with the same tag. */
  tag?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Logs the notification and delivers it through the OS when allowed.
 * `osSilent` keeps the entry in the center without an OS banner — used
 * when the server push already owns delivery for this device.
 */
export async function deliver(input: NotifyInput, at = Date.now(), osSilent = false) {
  const data = loadNotify();
  const quiet = inQuietHours(data.settings, new Date(at));
  const canShow = permissionState() === "granted" && !quiet && !osSilent;

  const item: NotifyItem = {
    id: uid(),
    kind: input.kind,
    title: input.title,
    body: input.body,
    at,
    read: false,
    color: input.color,
    activityId: input.activityId,
    taskId: input.taskId,
    link: input.link ?? "/",
    silent: !canShow,
  };

  updateNotify((d) => ({ ...d, items: [item, ...d.items] }));

  if (!canShow) return;

  const options: NotificationOptions = {
    body: input.body,
    tag: input.tag ?? item.id,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { link: item.link },
  };

  try {
    const reg = await ensureServiceWorker();
    if (reg) {
      await reg.showNotification(input.title, options);
      return;
    }
    new Notification(input.title, options);
  } catch {
    /* the OS refused it — it still lives in the notification center */
  }
}

/* ---------------- hook ---------------- */

export function useNotifyStore() {
  const [data, setData] = useState<NotifyData>(() =>
    typeof window === "undefined" ? DEFAULT : loadNotify(),
  );
  const [permission, setPermission] = useState<PermissionState>("default");

  useEffect(() => {
    setData(loadNotify());
    setPermission(permissionState());

    const l = () => setData({ ...memory });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const setSettings = useCallback((patch: Partial<NotifySettings>) => {
    updateNotify((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const markRead = useCallback((id: string) => {
    updateNotify((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
    }));
  }, []);

  const markAllRead = useCallback(() => {
    updateNotify((d) => ({ ...d, items: d.items.map((i) => ({ ...i, read: true })) }));
  }, []);

  const remove = useCallback((id: string) => {
    updateNotify((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
  }, []);

  const clearAll = useCallback(() => {
    updateNotify((d) => ({ ...d, items: [] }));
  }, []);

  const ask = useCallback(async () => {
    const next = await requestPermission();
    setPermission(next);
    return next;
  }, []);

  return {
    items: data.items,
    settings: data.settings,
    unread: data.items.filter((i) => !i.read).length,
    permission,
    setSettings,
    markRead,
    markAllRead,
    remove,
    clearAll,
    requestPermission: ask,
  };
}
