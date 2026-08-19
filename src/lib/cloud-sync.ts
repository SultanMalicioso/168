import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ *
 * Cloud sync
 * Mirrors the app's localStorage stores (actividades/objetivos/tareas,
 * temporizadores e historial) to the cloud so the same account sees the
 * same data on phone and computer. Local-first: everything keeps working
 * without a session; when signed in, changes are pushed (debounced) and
 * pulled on load / focus. Conflict rule: last write wins.
 * ------------------------------------------------------------------ */

export const SYNC_KEYS = ["week168.v2", "week168.timers.v1", "week168.history.v1"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

const META_KEY = "week168.sync.meta";
const CLOUD_UPDATED_EVENT = "week168:cloud-updated";

export type SyncStatus = "offline" | "idle" | "syncing" | "synced" | "error";

interface Meta {
  /** key → epoch ms of the last local write. */
  localAt: Record<string, number>;
}

function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return { localAt: p?.localAt && typeof p.localAt === "object" ? p.localAt : {} };
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

/* ---------------- state + pub/sub ---------------- */

let currentUser: User | null = null;
let status: SyncStatus = "offline";
let installed = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullInFlight: Promise<void> | null = null;
let applyingRemote = false;
const dirty = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setStatus(next: SyncStatus) {
  if (status === next) return;
  status = next;
  emit();
}

/* ---------------- push / pull ---------------- */

async function pushDirty() {
  if (!currentUser || dirty.size === 0) return;
  const keys = [...dirty];
  dirty.clear();
  const meta = readMeta();
  const rows = keys
    .map((key) => {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      let value: Json;
      try {
        value = JSON.parse(raw);
      } catch {
        return null;
      }
      return {
        user_id: currentUser!.id,
        key,
        value,
        updated_at: new Date(meta.localAt[key] ?? Date.now()).toISOString(),
      };
    })
    .filter(Boolean) as { user_id: string; key: string; value: Json; updated_at: string }[];
  if (rows.length === 0) return;

  setStatus("syncing");
  const { error } = await supabase.from("user_data").upsert(rows, { onConflict: "user_id,key" });
  if (error) {
    keys.forEach((k) => dirty.add(k));
    setStatus("error");
    return;
  }
  setStatus("synced");
}

function schedulePush(key: string) {
  dirty.add(key);
  if (!currentUser) return;
  setStatus("syncing");
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushDirty();
  }, 1200);
}

/** Download remote data; newer remote values replace the local ones. */
async function pull(): Promise<void> {
  if (!currentUser) return;

  // Don't start another pull while one is already running.
  if (pullInFlight) return pullInFlight;

  pullInFlight = (async () => {
    setStatus("syncing");

    const { data, error } = await supabase
      .from("user_data")
      .select("key,value,updated_at")
      .eq("user_id", currentUser!.id);

    if (error) {
      setStatus("error");
      return;
    }

    const meta = readMeta();
    const remote = new Map(
      (data ?? []).map((r) => [r.key as string, r])
    );

    let replaced = false;

    // Prevent remote data from triggering another cloud upload.
    applyingRemote = true;

    try {
      for (const key of SYNC_KEYS) {
        const row = remote.get(key);
        const localRaw = localStorage.getItem(key);
        const localAt = meta.localAt[key] ?? 0;

        if (!row) {
          if (localRaw != null) {
            meta.localAt[key] = localAt || Date.now();
            dirty.add(key);
          }
          continue;
        }

        const remoteAt = Date.parse(row.updated_at as string);

        if (localRaw != null && localAt > remoteAt) {
          dirty.add(key);
          continue;
        }

        const remoteRaw = JSON.stringify(row.value);

        if (remoteRaw !== localRaw) {
          try {
            localStorage.setItem(key, remoteRaw);
          } catch {
            /* quota */
          }

          meta.localAt[key] = remoteAt;
          replaced = true;
        } else {
          meta.localAt[key] = Math.max(localAt, remoteAt);
        }
      }

      writeMeta(meta);
    } finally {
      applyingRemote = false;
    }

    if (dirty.size) {
      await pushDirty();
    } else {
      setStatus("synced");
    }

    // IMPORTANT:
    // Never reload the page after receiving cloud data.
    // Reloading caused the mobile white-screen/sync loop.
    if (replaced) {
      window.dispatchEvent(new Event(CLOUD_UPDATED_EVENT));
    }
  })().finally(() => {
    pullInFlight = null;
  });

  return pullInFlight;
}

  const meta = readMeta();
  const remote = new Map((data ?? []).map((r) => [r.key as string, r]));
  let replaced = false;

  for (const key of SYNC_KEYS) {
    const row = remote.get(key);
    const localRaw = localStorage.getItem(key);
    const localAt = meta.localAt[key] ?? 0;

    if (!row) {
      // Nothing in the cloud yet: upload whatever this device has.
      if (localRaw != null) {
        meta.localAt[key] = localAt || Date.now();
        dirty.add(key);
      }
      continue;
    }

    const remoteAt = Date.parse(row.updated_at as string);
    if (localRaw != null && localAt > remoteAt) {
      dirty.add(key);
      continue;
    }
    const remoteRaw = JSON.stringify(row.value);
    if (remoteRaw !== localRaw) {
      try {
        localStorage.setItem(key, remoteRaw);
      } catch {
        /* quota */
      }
      meta.localAt[key] = remoteAt;
      replaced = true;
    } else {
      meta.localAt[key] = Math.max(localAt, remoteAt);
    }
  }

  writeMeta(meta);
  if (dirty.size) await pushDirty();
  else setStatus("synced");

  // The stores read localStorage on mount, so a reload is the safest way to
  // show data that just arrived from another device.
  if (replaced) window.location.reload();
}

/* ---------------- install ---------------- */

/** Patch localStorage.setItem once so every store write triggers a push. */
function installInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    original(key, value);
    if ((SYNC_KEYS as readonly string[]).includes(key)) {
      const meta = readMeta();
      meta.localAt[key] = Date.now();
      try {
        original(META_KEY, JSON.stringify(meta));
      } catch {
        /* quota */
      }
      schedulePush(key);
    }
  };
}

let started = false;

export function startCloudSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  installInterceptor();

  void supabase.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user ?? null;
    emit();
    if (currentUser) void pull();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user ?? null;
    const changed = next?.id !== currentUser?.id;
    currentUser = next;
    if (!next) {
      setStatus("offline");
      emit();
      return;
    }
    emit();
    if (changed || event === "SIGNED_IN") void pull();
  });

  window.addEventListener("focus", () => {
    if (currentUser) void pull();
  });
  window.addEventListener("beforeunload", () => {
    if (pushTimer) clearTimeout(pushTimer);
    void pushDirty();
  });
}

/* ---------------- hook ---------------- */

export function useCloudSync() {
  const [, force] = useState(0);

  useEffect(() => {
    startCloudSync();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const signOut = useCallback(async () => {
    if (pushTimer) clearTimeout(pushTimer);
    await pushDirty();
    await supabase.auth.signOut();
  }, []);

  const syncNow = useCallback(async () => {
    if (pushTimer) clearTimeout(pushTimer);
    await pushDirty();
    await pull();
  }, []);

  return { user: currentUser, status, signOut, syncNow };
}

export const STATUS_LABEL: Record<SyncStatus, string> = {
  offline: "Solo en este dispositivo",
  idle: "Listo",
  syncing: "Guardando…",
  synced: "Sincronizado",
  error: "Error al sincronizar",
};
