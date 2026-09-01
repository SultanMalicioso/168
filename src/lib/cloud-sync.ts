import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const SYNC_KEYS = [
  "week168.v2",
  "week168.timers.v1",
  "week168.history.v1",
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
      cloudHash:
        parsed?.cloudHash && typeof parsed.cloudHash === "object" ? parsed.cloudHash : {},
    };
  } catch {
    return { localAt: {}, cloudHash: {} };
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
  meta.cloudHash[key] = hash(value);

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
  return known != null && known === hash(local);
}

let currentUser: User | null = null;
let status: SyncStatus = "offline";

let started = false;
/** While true, local writes are queued but not uploaded (initial pull runs first). */
let bootstrapping = false;

let pushTimer: ReturnType<typeof setTimeout> | null = null;

let pushInFlight: Promise<void> | null = null;
let pullInFlight: Promise<void> | null = null;

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

async function pushDirty(): Promise<void> {
  if (!currentUser || dirty.size === 0) return;

  if (pushInFlight) {
    return pushInFlight;
  }

  const keys = [...dirty];

  pushInFlight = (async () => {
    setStatus("syncing");

    const rows: { user_id: string; key: string; value: Json }[] = [];
    const uploadedValues = new Map<string, string>();

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;

      try {
        rows.push({
          user_id: currentUser!.id,
          key,
          value: JSON.parse(raw) as Json,
        });
        uploadedValues.set(key, raw);
      } catch {
        /* Ignore malformed local data */
      }
    }

    if (rows.length === 0) {
      setStatus("synced");
      return;
    }

    const { error } = await supabase
      .from("user_data")
      .upsert(rows, { onConflict: "user_id,key" });

    if (error) {
      console.error("Cloud push error:", error);
      setStatus("error");
      return;
    }

    for (const key of keys) {
      const uploadedValue = uploadedValues.get(key);
      if (uploadedValue === undefined) continue;

      rememberCloudValue(key, uploadedValue, new Date().toISOString());

      if (localStorage.getItem(key) === uploadedValue) {
        dirty.delete(key);
      }
    }

    setStatus(dirty.size === 0 ? "synced" : "syncing");
  })().finally(() => {
    pushInFlight = null;
  });

  return pushInFlight;
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

async function pullFromCloud(): Promise<void> {
  if (!currentUser) return;

  if (pullInFlight) {
    return pullInFlight;
  }

  pullInFlight = (async () => {
    setStatus("syncing");

    const { data, error } = await supabase
      .from("user_data")
      .select("key,value,updated_at")
      .eq("user_id", currentUser!.id);

    if (error) {
      console.error("Cloud pull error:", error);
      setStatus("error");
      return;
    }

    const remote = new Map((data ?? []).map((row) => [row.key as string, row]));

    let changed = false;

    for (const key of SYNC_KEYS) {
      /* Never overwrite a real local edit that hasn't uploaded yet. */
      if (dirty.has(key)) continue;

      const row = remote.get(key);
      if (!row) continue;

      const remoteValue = JSON.stringify(row.value);
      const localValue = localStorage.getItem(key);

      if (remoteValue !== localValue) {
        localStorage.setItem(key, remoteValue);
        changed = true;
      }

      rememberCloudValue(key, remoteValue, row.updated_at as string);
    }

    if (changed) {
      window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));
    }

    setStatus(dirty.size === 0 ? "synced" : "syncing");
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

  bootstrapping = true;
  setStatus("syncing");

  try {
    /* Cloud first: a second device must adopt the account data. */
    await pullFromCloud();

    /*
     * Anything still unknown to the cloud (first login, or edits
     * made before the pull finished) gets uploaded.
     */
    for (const key of SYNC_KEYS) {
      if (localStorage.getItem(key) != null && !matchesCloud(key)) {
        dirty.add(key);
      }
    }
  } finally {
    bootstrapping = false;
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

    emit();

    if (currentUser) {
      void initialSync();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user ?? null;
    const changed = nextUser?.id !== currentUser?.id;

    currentUser = nextUser;

    if (!nextUser) {
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

    void (async () => {
      if (dirty.size > 0) await pushDirty();
      await pullFromCloud();
    })();
  });

  window.addEventListener("beforeunload", () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    void pushDirty();
  });
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

  const signOut = useCallback(async () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    await pushDirty();
    await supabase.auth.signOut();
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

  return {
    user: currentUser,
    status,
    signOut,
    syncNow: refresh,
    refresh,
  };
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
