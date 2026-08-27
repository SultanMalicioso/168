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

export type SyncStatus =
  | "offline"
  | "idle"
  | "syncing"
  | "synced"
  | "error";

interface Meta {
  localAt: Record<string, number>;
}

function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    return {
      localAt:
        parsed?.localAt && typeof parsed.localAt === "object"
          ? parsed.localAt
          : {},
    };
  } catch {
    return { localAt: {} };
  }
}

function writeMeta(meta: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* quota */
  }
}

let currentUser: User | null = null;
let status: SyncStatus = "offline";

let installed = false;
let started = false;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

let pushInFlight: Promise<void> | null = null;
let pullInFlight: Promise<void> | null = null;

let applyingRemote = false;

/*
 * These are changes made on THIS device that have not yet
 * been successfully uploaded.
 */
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

    const rows: {
      user_id: string;
      key: string;
      value: Json;
    }[] = [];

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

    /*
     * updated_at is intentionally NOT supplied.
     *
     * Supabase's database default/trigger should control the
     * timestamp, instead of the clock of the user's device.
     */
    const { error } = await supabase
      .from("user_data")
      .upsert(rows, {
        onConflict: "user_id,key",
      });

    if (error) {
      setStatus("error");
      return;
    }

    /*
     * Only mark a change as uploaded if the local value is
     * still exactly the same value that we uploaded.
     */
    for (const key of keys) {
      const uploadedValue = uploadedValues.get(key);
      const currentValue = localStorage.getItem(key);

      if (uploadedValue !== undefined && currentValue === uploadedValue) {
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
  dirty.add(key);

  if (!currentUser) {
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
 * DOWNLOAD FROM CLOUD
 *
 * This function treats Supabase as the source of truth.
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

    const remote = new Map(
      (data ?? []).map((row) => [row.key as string, row])
    );

    const meta = readMeta();

    let changed = false;

    /*
     * Remote writes must not be considered local edits.
     */
    applyingRemote = true;

    try {
      for (const key of SYNC_KEYS) {
        /*
         * NEVER overwrite a local change that hasn't finished
         * uploading yet.
         */
        if (dirty.has(key)) {
          continue;
        }

        const row = remote.get(key);

        if (!row) {
          continue;
        }

        const remoteValue = JSON.stringify(row.value);
        const localValue = localStorage.getItem(key);

        if (remoteValue === localValue) {
          const timestamp = Date.parse(row.updated_at as string);

          if (Number.isFinite(timestamp)) {
            meta.localAt[key] = timestamp;
          }

          continue;
        }

        /*
         * CLOUD IS THE SOURCE OF TRUTH.
         *
         * Replace the local copy with the cloud copy.
         */
        localStorage.setItem(key, remoteValue);

        const timestamp = Date.parse(row.updated_at as string);

        if (Number.isFinite(timestamp)) {
          meta.localAt[key] = timestamp;
        }

        changed = true;
      }

      writeMeta(meta);
    } finally {
      applyingRemote = false;
    }

    if (changed) {
      /*
       * Tell the rest of the application that the calendar
       * needs to reload its state from localStorage.
       */
      window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));
    }

    setStatus("synced");
  })().finally(() => {
    pullInFlight = null;
  });

  return pullInFlight;
}

/* -----------------------------------------------------------
 * UPLOAD + INITIAL LOAD
 * --------------------------------------------------------- */

async function initialSync(): Promise<void> {
  if (!currentUser) return;

  /*
   * First check whether the account already has cloud data.
   */
  const { data, error } = await supabase
    .from("user_data")
    .select("key,value,updated_at")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Initial sync error:", error);
    setStatus("error");
    return;
  }

  /*
   * If the account already has data, CLOUD WINS.
   *
   * This is critical when logging into a second device.
   */
  if (data && data.length > 0) {
    await pullFromCloud();
    return;
  }

  /*
   * If the account has never stored anything, use the current
   * local device as the initial source.
   */
  for (const key of SYNC_KEYS) {
    if (localStorage.getItem(key) != null) {
      dirty.add(key);
    }
  }

  await pushDirty();

  setStatus("synced");
}

/* -----------------------------------------------------------
 * LOCAL STORAGE INTERCEPTOR
 * --------------------------------------------------------- */



/* -----------------------------------------------------------
 * START
 * --------------------------------------------------------- */

export function startCloudSync() {
  if (started || typeof window === "undefined") {
    return;
  }

  started = true;

  installInterceptor();

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

  /*
   * Automatically save local changes.
   */
  window.addEventListener("focus", () => {
    if (currentUser && dirty.size > 0) {
      void pushDirty();
    }
  });

  /*
   * Check the account every 5 seconds.
   *
   * IMPORTANT:
   * This only DOWNLOADS cloud data.
   *
   * It does NOT upload the local calendar first.
   */
  syncInterval = setInterval(() => {
    if (currentUser && dirty.size === 0) {
      void pullFromCloud();
    }
  }, 5000);

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

  /*
   * This is now an ACTUAL "Actualizar".
   *
   * It downloads the current account data.
   * It does NOT upload the local calendar first.
   */
  const refresh = useCallback(async () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    /*
     * If this device still has unsaved changes, save them first.
     */
    if (dirty.size > 0) {
      await pushDirty();
    }

    /*
     * Now download the account's current version.
     */
    await pullFromCloud();
  }, []);

  return {
    user: currentUser,
    status,
    signOut,

    /*
     * Keep the old name so existing components don't break.
     */
    syncNow: refresh,

    /*
     * New clearer name.
     */
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
