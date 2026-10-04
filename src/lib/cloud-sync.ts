import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { merge3 } from "@/lib/sync-merge";
import { retryDelay } from "@/lib/sync-retry";
import { toast } from "sonner";

export const SYNC_KEYS = [
  "week168.v2",
  "week168.timers.v1",
  "week168.history.v1",
  "week168.notify.v1",
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];

const META_KEY = "week168.sync.meta";
export const CLOUD_UPDATED_EVENT = "week168:cloud-updated";
export const LOCAL_DATA_CHANGED_EVENT = "week168:local-data-changed";

export type SyncStatus = "offline" | "idle" | "syncing" | "synced" | "error";

interface Meta {
  localAt: Record<string, number>;
  /** Hash of the last value known to be stored in the cloud, per key. */
  cloudHash: Record<string, string>;
  /** Last cloud value seen, per key: the common base for merging edits. */
  cloudBase: Record<string, string>;
  /** Account these hashes belong to. */
  userId?: string;
}

/** Key-order independent serialization so that re-normalized data compares equal. */
function canonical(value: string): string {
  try {
    return stableStringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function stableStringify(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map(stableStringify).join(",")}]`;
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(input) ?? "null";
}

function hash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return `${h.toString(36)}:${value.length}`;
}

function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    return {
      localAt: parsed?.localAt && typeof parsed.localAt === "object" ? parsed.localAt : {},
      cloudHash: parsed?.cloudHash && typeof parsed.cloudHash === "object" ? parsed.cloudHash : {},
      cloudBase: parsed?.cloudBase && typeof parsed.cloudBase === "object" ? parsed.cloudBase : {},
      userId: typeof parsed?.userId === "string" ? parsed.userId : undefined,
    };
  } catch {
    return { localAt: {}, cloudHash: {}, cloudBase: {} };
  }
}

function writeMeta(meta: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* quota */
  }
}

function rememberCloudValue(key: string, value: string, updatedAt?: string) {
  const meta = readMeta();
  meta.cloudHash[key] = hash(canonical(value));
  meta.cloudBase[key] = value;

  if (updatedAt) {
    const timestamp = Date.parse(updatedAt);
    if (Number.isFinite(timestamp)) {
      meta.localAt[key] = timestamp;
    }
  }

  writeMeta(meta);
}

function matchesCloud(key: string): boolean {
  const local = localStorage.getItem(key);
  if (local == null) return true;

  const known = readMeta().cloudHash[key];
  return known != null && known === hash(canonical(local));
}

let currentUser: User | null = null;
/** True once the stored session (if any) has been read. */
let authChecked = false;
let status: SyncStatus = "offline";

let started = false;
/** While true, local writes are queued but not uploaded (initial pull runs first). */
let bootstrapping = false;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Set while the account is being deleted: nothing may sync back up. */
let deleting = false;

let pushInFlight: Promise<void> | null = null;
/** Pending retry for keys that are still dirty after a push. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Failed pushes in a row, for the retry backoff. */
let failedPushes = 0;
let pullInFlight: Promise<Set<string> | null> | null = null;
/** The first sync of this session failed: retry it instead of plain pulls. */
let initialSyncPending = false;

/** Changes made on THIS device that have not yet been uploaded. */
const dirty = new Set<string>();

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: SyncStatus) {
  status = next;
  emit();
}

/* -----------------------------------------------------------
 * PUSH
 * --------------------------------------------------------- */

function cancelRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * Keys can stay dirty after a push: it failed, or they were edited while it
 * ran. Try again later so nothing is left waiting for the next edit.
 */
function scheduleRetry(succeeded: boolean) {
  if (succeeded) failedPushes = 0;
  cancelRetry();
  if (deleting || !currentUser || dirty.size === 0) return;

  const delay = retryDelay(succeeded ? 0 : failedPushes);
  if (!succeeded) failedPushes++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pushDirty();
  }, delay);
}

async function pushDirty(): Promise<void> {
  if (deleting || bootstrapping || !currentUser || dirty.size === 0) return;

  if (pushInFlight) {
    return pushInFlight;
  }

  cancelRetry();
  const keys = [...dirty];

  pushInFlight = uploadKeys(keys, currentUser.id)
    .catch((error) => {
      console.error("Cloud push error:", error);
      setStatus("error");
      return false;
    })
    .then((succeeded) => {
      pushInFlight = null;
      scheduleRetry(succeeded);
    });

  return pushInFlight;
}

/** Uploads `keys`; resolves to false when the cloud couldn't be updated. */
async function uploadKeys(keys: string[], userId: string): Promise<boolean> {
  setStatus("syncing");

  const rows: { user_id: string; key: string; value: Json }[] = [];
  const uploadedValues = new Map<string, string>();

  /*
   * Another device may have saved since this one last synced: merge both
   * edits instead of overwriting theirs with ours.
   */
  const { data: remoteRows, error: readError } = await supabase
    .from("user_data")
    .select("key,value")
    .eq("user_id", userId)
    .in("key", keys);
  if (readError) {
    console.error("Cloud read before push failed:", readError);
    setStatus("error");
    return false;
  }
  const meta = readMeta();
  let mergedLocally = false;

  for (const key of keys) {
    let raw = localStorage.getItem(key);
    if (raw == null) {
      /* Nothing left to upload (e.g. cleared): stop retrying it. */
      dirty.delete(key);
      continue;
    }

    const remote = remoteRows?.find((r) => r.key === key);
    if (remote) {
      const remoteRaw = JSON.stringify(remote.value);
      if (hash(canonical(remoteRaw)) !== meta.cloudHash[key]) {
        try {
          const base = meta.cloudBase[key] ? JSON.parse(meta.cloudBase[key]) : undefined;
          const merged = JSON.stringify(merge3(base, JSON.parse(raw), remote.value));
          if (merged !== raw) {
            localStorage.setItem(key, merged);
            raw = merged;
            mergedLocally = true;
          }
        } catch {
          /* Malformed data: keep the local copy */
        }
      }
    }

    try {
      rows.push({
        user_id: userId,
        key,
        value: JSON.parse(raw) as Json,
      });
      uploadedValues.set(key, raw);
    } catch {
      /* Malformed local data can never upload: don't keep retrying it. */
      dirty.delete(key);
    }
  }

  if (rows.length === 0) {
    setStatus("synced");
    return true;
  }

  const { error } = await supabase.from("user_data").upsert(rows, { onConflict: "user_id,key" });

  if (error) {
    console.error("Cloud push error:", error);
    setStatus("error");
    return false;
  }

  for (const key of keys) {
    const uploadedValue = uploadedValues.get(key);
    if (uploadedValue === undefined) continue;

    rememberCloudValue(key, uploadedValue, new Date().toISOString());

    if (localStorage.getItem(key) === uploadedValue) {
      dirty.delete(key);
    }
  }

  if (mergedLocally) window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));

  setStatus(dirty.size === 0 ? "synced" : "syncing");
  return true;
}

/* -----------------------------------------------------------
 * LOCAL CHANGE
 * --------------------------------------------------------- */

function schedulePush(key: string) {
  /*
   * Stores rewrite localStorage on mount with the very same data
   * they just loaded. Those echoes must NOT be treated as edits,
   * otherwise they block the download of newer cloud data.
   */
  if (matchesCloud(key)) {
    dirty.delete(key);
    return;
  }

  dirty.add(key);

  if (!currentUser || bootstrapping) {
    return;
  }

  setStatus("syncing");

  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  pushTimer = setTimeout(() => {
    void pushDirty();
  }, 700);
}

/* -----------------------------------------------------------
 * DOWNLOAD FROM CLOUD (cloud is the source of truth)
 * --------------------------------------------------------- */

/**
 * `quiet` skips the "syncing" badge for background checks; `adopt` takes the
 * cloud copy even over pending local changes (first sync of an account).
 */
/** Resolves to the keys the cloud has, or null when it couldn't be read. */
async function pullFromCloud(quiet = false, adopt = false): Promise<Set<string> | null> {
  if (deleting) return null;
  if (!currentUser) return null;

  if (pullInFlight) {
    return pullInFlight;
  }

  pullInFlight = (async () => {
    if (!quiet) setStatus("syncing");

    const { data, error } = await supabase
      .from("user_data")
      .select("key,value,updated_at")
      .eq("user_id", currentUser!.id);

    if (error) {
      console.error("Cloud pull error:", error);
      setStatus("error");
      return null;
    }

    const remote = new Map((data ?? []).map((row) => [row.key as string, row]));

    let changed = false;

    for (const key of SYNC_KEYS) {
      const row = remote.get(key);
      if (!row) continue;

      /* Never overwrite a real local edit that hasn't uploaded yet. */
      if (dirty.has(key)) {
        if (!adopt) continue;
        dirty.delete(key);
      }

      const remoteValue = JSON.stringify(row.value);
      const localValue = localStorage.getItem(key);

      if (localValue == null || canonical(remoteValue) !== canonical(localValue)) {
        localStorage.setItem(key, remoteValue);
        changed = true;
      }

      rememberCloudValue(key, remoteValue, row.updated_at as string);
    }

    if (changed) {
      window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));
    }

    setStatus(dirty.size === 0 ? "synced" : "syncing");
    return new Set(remote.keys());
  })().finally(() => {
    pullInFlight = null;
  });

  return pullInFlight;
}

/* -----------------------------------------------------------
 * INITIAL SYNC
 * --------------------------------------------------------- */

async function initialSync(): Promise<void> {
  if (!currentUser) return;
  const userId = currentUser.id;

  bootstrapping = true;
  initialSyncPending = false;
  setStatus("syncing");

  /*
   * First sync of this account on this device: what is stored locally is
   * demo data or another account's, never newer than the account's cloud
   * copy. The cloud wins.
   */
  const meta = readMeta();
  const legacySynced = meta.userId === undefined && Object.keys(meta.cloudHash).length > 0;
  const firstSync = meta.userId !== userId && !legacySynced;
  /* Local data belongs to another account: it must never reach this one. */
  const otherAccount = firstSync && meta.userId !== undefined;
  if (firstSync) dirty.clear();

  try {
    /* Cloud first: a second device must adopt the account data. */
    const cloudKeys = await pullFromCloud(false, firstSync);
    if (!cloudKeys) {
      /* Upload nothing until the account's data could be read. */
      initialSyncPending = true;
      return;
    }

    if (firstSync) {
      /* Hashes of keys this account lacks belonged to the previous one. */
      const next = readMeta();
      for (const key of SYNC_KEYS) {
        if (cloudKeys.has(key)) continue;
        delete next.cloudHash[key];
        delete next.cloudBase[key];
        delete next.localAt[key];
      }
      writeMeta({ ...next, userId });
    } else if (meta.userId !== userId) {
      writeMeta({ ...readMeta(), userId });
    }

    /*
     * Anything still unknown to the cloud (first login, or edits made
     * before the pull finished) gets uploaded; another account's data is
     * dropped instead.
     */
    let dropped = false;
    for (const key of SYNC_KEYS) {
      if (localStorage.getItem(key) == null || matchesCloud(key)) continue;
      if (otherAccount && !cloudKeys.has(key)) {
        localStorage.removeItem(key);
        dropped = true;
      } else {
        dirty.add(key);
      }
    }
    if (dropped) {
      /* In-memory stores still hold the other account's data. */
      window.location.reload();
      return;
    }
  } finally {
    /* While the first sync is pending, local edits stay on this device. */
    bootstrapping = initialSyncPending;
  }

  await pushDirty();

  setStatus(dirty.size === 0 ? "synced" : "syncing");
}

/* -----------------------------------------------------------
 * START
 * --------------------------------------------------------- */

export function startCloudSync() {
  if (started || typeof window === "undefined") {
    return;
  }

  started = true;

  window.addEventListener(LOCAL_DATA_CHANGED_EVENT, (event) => {
    const customEvent = event as CustomEvent<{ key?: string }>;
    const key = customEvent.detail?.key;

    if (!key) return;
    if (!(SYNC_KEYS as readonly string[]).includes(key)) return;

    schedulePush(key);
  });

  void supabase.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user ?? null;
    authChecked = true;

    emit();

    if (currentUser) {
      void initialSync();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user ?? null;
    const changed = nextUser?.id !== currentUser?.id;
    authChecked = true;

    currentUser = nextUser;

    if (!nextUser) {
      initialSyncPending = false;
      bootstrapping = false;
      cancelRetry();
      setStatus("offline");
      return;
    }

    emit();

    if (changed || event === "SIGNED_IN") {
      void initialSync();
    }
  });

  /* Save pending work and re-check the cloud when the tab regains focus. */
  window.addEventListener("focus", () => {
    if (!currentUser) return;

    if (initialSyncPending) {
      void initialSync();
      return;
    }

    void (async () => {
      if (dirty.size > 0) await pushDirty();
      await pullFromCloud();
    })();
  });

  /* Upload pending work right away (skips the debounce). */
  const flush = () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }

    void pushDirty();
  };

  window.addEventListener("beforeunload", flush);

  /*
   * iOS never fires `beforeunload` when an installed app is closed:
   * `pagehide` / hidden visibility are the last chance to upload (e.g. a
   * timer that was just started).
   */
  window.addEventListener("pagehide", flush);

  document.addEventListener("visibilitychange", () => {
    if (!currentUser) return;

    if (document.visibilityState === "hidden") {
      flush();
      return;
    }

    if (initialSyncPending) {
      void initialSync();
      return;
    }

    /* Back in the app: pick up what other devices changed meanwhile. */
    void (async () => {
      if (dirty.size > 0) await pushDirty();
      await pullFromCloud(true);
    })();
  });

  /* While the app is visible, keep up with other devices (e.g. a timer started elsewhere). */
  window.setInterval(() => {
    if (!currentUser || document.visibilityState !== "visible") return;
    if (initialSyncPending) {
      void initialSync();
      return;
    }
    if (bootstrapping) return;
    if (pushInFlight) return;
    /* Pending local edits go up first; the cloud is checked on a later tick. */
    if (dirty.size > 0) {
      void pushDirty();
      return;
    }
    void pullFromCloud(true);
  }, 15_000);
}

/* -----------------------------------------------------------
 * HOOK
 * --------------------------------------------------------- */

export function useCloudSync() {
  const [, force] = useState(0);

  useEffect(() => {
    startCloudSync();

    const listener = () => {
      force((value) => value + 1);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  /**
   * Uploads what is pending, unregisters this device's push subscription
   * and leaves no account data behind. If the last changes can't be saved
   * the session stays open and nothing is deleted.
   */
  const signOut = useCallback(async (): Promise<boolean> => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    cancelRetry();

    if (pushInFlight) await pushInFlight;
    await pushDirty();
    if (dirty.size > 0) {
      toast.error(
        "No pudimos guardar tus últimos cambios en la nube. Revisá tu conexión y probá de nuevo.",
      );
      return false;
    }

    try {
      const { disableDevicePush } = await import("@/lib/push-client");
      await disableDevicePush();
    } catch {
      /* The subscription may already be gone; signing out matters more. */
    }

    await supabase.auth.signOut();
    clearDeviceData();
    // In-memory stores still hold the account's data: start fresh.
    window.location.assign("/");
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    if (dirty.size > 0) {
      await pushDirty();
    }

    await pullFromCloud();
  }, []);

  const deleteAccount = useCallback(async () => {
    deleting = true;
    if (pushTimer) clearTimeout(pushTimer);
    cancelRetry();
    dirty.clear();
    try {
      const { deleteAccount: deleteOnServer } = await import("@/lib/account.functions");
      await deleteOnServer();
    } catch (error) {
      deleting = false;
      throw error;
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearDeviceData();
  }, []);

  return {
    user: currentUser,
    authChecked,
    status,
    signOut,
    deleteAccount,
    syncNow: refresh,
    refresh,
  };
}

/** Removes every piece of 168 data stored in this browser. */
export function clearDeviceData() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("week168")) localStorage.removeItem(key);
  }
}

/* -----------------------------------------------------------
 * STATUS LABELS
 * --------------------------------------------------------- */

export const STATUS_LABEL: Record<SyncStatus, string> = {
  offline: "Solo en este dispositivo",
  idle: "Listo",
  syncing: "Actualizando…",
  synced: "Actualizado",
  error: "Error al actualizar",
};
