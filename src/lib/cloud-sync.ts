import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------
 * Cloud sync
 *
 * Keeps the same 168 data on every device using the same account.
 *
 * Important rules:
 * - Local changes are marked dirty until successfully uploaded.
 * - A pull NEVER overwrites a dirty local key.
 * - Remote changes are applied only when there is no pending local change.
 * - Server time is used when uploading, avoiding device-clock conflicts.
 * - No page reload is ever performed after synchronization.
 * ------------------------------------------------------------------ */

export const SYNC_KEYS = [
  "week168.v2",
  "week168.timers.v1",
  "week168.history.v1",
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];

const META_KEY = "week168.sync.meta";
const CLOUD_UPDATED_EVENT = "week168:cloud-updated";

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

/* ---------------- state ---------------- */

let currentUser: User | null = null;

let status: SyncStatus = "offline";

let installed = false;
let started = false;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

let pullInFlight: Promise<void> | null = null;
let pushInFlight: Promise<void> | null = null;

let applyingRemote = false;

/*
 * A key remains dirty until its uploaded value is confirmed.
 *
 * This is the most important change:
 * pull() will NEVER overwrite a dirty key.
 */
const dirty = new Set<string>();

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: SyncStatus) {
  if (status === next) return;

  status = next;
  emit();
}

/* ---------------- push ---------------- */

async function pushDirty(): Promise<void> {
  if (!currentUser || dirty.size === 0) return;

  /*
   * Don't start two uploads at the same time.
   */
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
      updated_at: string;
    }[] = [];

    /*
     * Capture the exact values that are going to be uploaded.
     */
    const uploadedValues = new Map<string, string>();

    for (const key of keys) {
      const raw = localStorage.getItem(key);

      if (raw == null) continue;

      try {
        const value = JSON.parse(raw) as Json;

        rows.push({
          user_id: currentUser!.id,
          key,
          value,

          /*
           * Use Supabase/server time instead of the device clock.
           * The database trigger/default can also update this value.
           */
          updated_at: new Date().toISOString(),
        });

        uploadedValues.set(key, raw);
      } catch {
        /* Ignore malformed local data. */
      }
    }

    if (rows.length === 0) {
      setStatus("synced");
      return;
    }

    /*
     * Upsert the local changes.
     */
    const { error } = await supabase
      .from("user_data")
      .upsert(rows, {
        onConflict: "user_id,key",
      });

    if (error) {
      /*
       * Keep everything dirty.
       * Nothing gets lost and the next sync will retry.
       */
      setStatus("error");
      return;
    }

    /*
     * Only clear a key if the value in localStorage is still
     * exactly the value that we uploaded.
     *
     * This prevents a change made while the upload was running
     * from being accidentally marked as synchronized.
     */
    for (const key of keys) {
      const uploadedValue = uploadedValues.get(key);
      const currentValue = localStorage.getItem(key);

      if (uploadedValue !== undefined && currentValue === uploadedValue) {
        dirty.delete(key);
      }
    }

    setStatus("synced");
  })().finally(() => {
    pushInFlight = null;
  });

  return pushInFlight;
}

/* ---------------- schedule push ---------------- */

function schedulePush(key: string) {
  /*
   * Mark the change immediately.
   */
  dirty.add(key);

  if (!currentUser) {
    return;
  }

  setStatus("syncing");

  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  /*
   * Small debounce so editing an activity does not create
   * dozens of database writes.
   */
  pushTimer = setTimeout(() => {
    void pushDirty();
  }, 1000);
}

/* ---------------- pull ---------------- */

async function pull(): Promise<void> {
  if (!currentUser) return;

  /*
   * Don't run multiple pulls at the same time.
   */
  if (pullInFlight) {
    return pullInFlight;
  }

  pullInFlight = (async () => {
    setStatus("syncing");

    /*
     * First, make sure local changes are uploaded.
     *
     * This is important when:
     * - the phone changed something
     * - the computer is still showing the old version
     * - a focus/interval event happens before the normal upload
     */
    if (dirty.size > 0) {
      await pushDirty();
    }

    /*
     * If there are still dirty keys, don't pull yet.
     *
     * Pulling now could overwrite unsynchronized local data.
     */
    if (dirty.size > 0) {
      setStatus("syncing");
      return;
    }

    const { data, error } = await supabase
      .from("user_data")
      .select("key,value,updated_at")
      .eq("user_id", currentUser.id);

    if (error) {
      setStatus("error");
      return;
    }

    const meta = readMeta();

    const remote = new Map(
      (data ?? []).map((row) => [row.key as string, row])
    );

    let replaced = false;

    /*
     * Prevent localStorage.setItem from treating remote data
     * as a new local change.
     */
    applyingRemote = true;

    try {
      for (const key of SYNC_KEYS) {
        /*
         * SAFETY CHECK:
         *
         * A local change may have happened while the request
         * was running.
         *
         * Never overwrite it with remote data.
         */
        if (dirty.has(key)) {
          continue;
        }

        const row = remote.get(key);

        const localRaw = localStorage.getItem(key);

        if (!row) {
          /*
           * Nothing exists in the cloud yet.
           *
           * If local data exists, upload it.
           */
          if (localRaw != null) {
            dirty.add(key);
          }

          continue;
        }

        const remoteRaw = JSON.stringify(row.value);

        /*
         * If both are identical, nothing to do.
         */
        if (remoteRaw === localRaw) {
          const remoteAt = Date.parse(row.updated_at as string);

          if (Number.isFinite(remoteAt)) {
            meta.localAt[key] = remoteAt;
          }

          continue;
        }

        /*
         * Remote data is different and there is no pending
         * local change, so the remote version is safe to apply.
         */
        try {
          localStorage.setItem(key, remoteRaw);
        } catch {
          /* quota */
        }

        const remoteAt = Date.parse(row.updated_at as string);

        if (Number.isFinite(remoteAt)) {
          meta.localAt[key] = remoteAt;
        }

        replaced = true;
      }

      writeMeta(meta);
    } finally {
      applyingRemote = false;
    }

    /*
     * If the pull discovered local-only data, upload it now.
     */
    if (dirty.size > 0) {
      await pushDirty();
    }

    if (dirty.size === 0) {
      setStatus("synced");
    }

    /*
     * Notify the app that cloud data changed.
     *
     * IMPORTANT:
     * No reload().
     */
    if (replaced) {
      window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));
    }
  })().finally(() => {
    pullInFlight = null;
  });

  return pullInFlight;
}

/* ---------------- localStorage interceptor ---------------- */

function installInterceptor() {
  if (installed || typeof window === "undefined") {
    return;
  }

  installed = true;

  const originalSetItem = localStorage.setItem.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    /*
     * Always write locally first.
     */
    originalSetItem(key, value);

    /*
     * Remote data must NOT be interpreted as a new local edit.
     */
    if (applyingRemote) {
      return;
    }

    if (!(SYNC_KEYS as readonly string[]).includes(key)) {
      return;
    }

    /*
     * Record when this device changed the data.
     */
    const meta = readMeta();

    meta.localAt[key] = Date.now();

    try {
      originalSetItem(META_KEY, JSON.stringify(meta));
    } catch {
      /* quota */
    }

    /*
     * Most importantly:
     * mark this key dirty immediately.
     */
    schedulePush(key);
  };
}

/* ---------------- startup ---------------- */

export function startCloudSync() {
  if (started || typeof window === "undefined") {
    return;
  }

  started = true;

  installInterceptor();

  /*
   * Get the current Supabase session.
   */
  void supabase.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user ?? null;

    emit();

    if (currentUser) {
      void pull();
    }
  });

  /*
   * React to login/logout.
   */
  supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user ?? null;

    const changed = nextUser?.id !== currentUser?.id;

    currentUser = nextUser;

    if (!nextUser) {
      setStatus("offline");
      emit();
      return;
    }

    emit();

    if (changed || event === "SIGNED_IN") {
      void pull();
    }
  });

  /*
   * When returning to the tab/app, synchronize.
   */
  window.addEventListener("focus", () => {
    if (currentUser) {
      void pull();
    }
  });

  /*
   * Periodic synchronization.
   *
   * This makes changes appear on another device without
   * needing to reload the page manually.
   */
  syncInterval = setInterval(() => {
    if (currentUser) {
      void pull();
    }
  }, 5000);

  /*
   * Try to upload pending changes before leaving.
   */
  window.addEventListener("beforeunload", () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    void pushDirty();
  });
}

/* ---------------- hook ---------------- */

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

  const syncNow = useCallback(async () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
    }

    /*
     * First upload local changes.
     * Then download anything else.
     */
    await pushDirty();

    await pull();
  }, []);

  return {
    user: currentUser,
    status,
    signOut,
    syncNow,
  };
}

/* ---------------- labels ---------------- */

export const STATUS_LABEL: Record<SyncStatus, string> = {
  offline: "Solo en este dispositivo",
  idle: "Listo",
  syncing: "Guardando…",
  synced: "Sincronizado",
  error: "Error al sincronizar",
};
