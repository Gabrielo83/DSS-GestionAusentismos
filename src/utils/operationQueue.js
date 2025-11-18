import {
  OPERATION_QUEUE_STORAGE_KEY,
  OPERATION_QUEUE_UPDATED_EVENT,
} from "./storageKeys.js";
import { readEntity, saveEntity } from "./indexedDbClient.js";

const IDB_STORE = "queue";
const IDB_KEY = "queue";

const isBrowser = () => typeof window !== "undefined";
const nowIso = () => new Date().toISOString();
const hasNavigator = () => typeof navigator !== "undefined";

const syncFromIndexedDb = async () => {
  if (!isBrowser()) return;
  try {
    const idbValue = await readEntity(IDB_STORE, IDB_KEY);
    if (!idbValue) return;
    const raw = window.localStorage.getItem(OPERATION_QUEUE_STORAGE_KEY);
    const localValue = raw ? JSON.parse(raw) : [];
    const isDifferent = JSON.stringify(localValue) !== JSON.stringify(idbValue);
    if (isDifferent) {
      window.localStorage.setItem(
        OPERATION_QUEUE_STORAGE_KEY,
        JSON.stringify(idbValue),
      );
      window.dispatchEvent(new Event(OPERATION_QUEUE_UPDATED_EVENT));
    }
  } catch (error) {
    console.warn("No se pudo sincronizar la cola desde IndexedDB:", error);
  }
};

const readRawQueue = () => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(OPERATION_QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    syncFromIndexedDb();
    return parsed;
  } catch (error) {
    console.warn("No se pudo leer la cola de operaciones:", error);
    return [];
  }
};

const persistQueue = (queue) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(OPERATION_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(OPERATION_QUEUE_UPDATED_EVENT));
  saveEntity(IDB_STORE, IDB_KEY, queue);
};

export const readOperationQueue = () => readRawQueue();

const buildOperation = (type, payload, meta = {}) => ({
  id: meta.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  payload,
  status: meta.status || "pending",
  createdAt: nowIso(),
  lastAttemptAt: meta.lastAttemptAt || null,
  retryCount: meta.retryCount || 0,
  lastError: meta.lastError || null,
  user: meta.user || null,
  entityId: meta.entityId || null,
});

export const enqueueOperation = (type, payload = {}, meta = {}) => {
  if (!type) return null;
  const queue = readRawQueue();
  const op = buildOperation(type, payload, meta);
  const filtered = queue.filter((item) => item.id !== op.id);
  persistQueue([...filtered, op]);
  return op;
};

export const markOperationStatus = (id, status, patch = {}) => {
  if (!id || !status) return;
  const queue = readRawQueue();
  const updated = queue.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          lastAttemptAt: nowIso(),
          ...patch,
        }
      : item,
  );
  persistQueue(updated);
};

export const removeOperation = (id) => {
  if (!id) return;
  const queue = readRawQueue();
  const filtered = queue.filter((item) => item.id !== id);
  if (filtered.length === queue.length) return;
  persistQueue(filtered);
};

const defaultHandler = async (operation) => {
  // Simula sync remoto; en producción reemplazar por llamadas HTTP/Firebase.
  const isOffline = hasNavigator() && navigator.onLine === false;
  if (isOffline) {
    return { ok: false, reason: "offline" };
  }
  // Pequeño delay para no bloquear UI
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ok: true };
};

export const processQueue = async (handler = defaultHandler) => {
  const queue = readRawQueue();
  if (!queue.length) return { processed: 0, pending: 0 };

  const nextQueue = [];
  let processed = 0;

  for (const op of queue) {
    if (op.status === "synced") continue;

    if (hasNavigator() && navigator.onLine === false) {
      nextQueue.push(op);
      continue;
    }

    const attemptAt = nowIso();
    const result = await handler(op).catch((error) => ({
      ok: false,
      error: error?.message || error?.toString?.() || "sync failed",
    }));

    if (result?.ok) {
      processed += 1;
      continue; // Se elimina del queue
    }

    nextQueue.push({
      ...op,
      status: "pending",
      lastAttemptAt: attemptAt,
      retryCount: (op.retryCount || 0) + 1,
      lastError: result?.error || result?.reason || "sync failed",
    });
  }

  if (nextQueue.length !== queue.length || processed > 0) {
    persistQueue(nextQueue);
  }

  return { processed, pending: nextQueue.length };
};

export const clearOperationQueue = () => persistQueue([]);

export const startQueueSync = (handler) => {
  if (!isBrowser()) return () => {};
  let syncing = false;

  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      await processQueue(handler);
    } finally {
      syncing = false;
    }
  };

  const onlineHandler = () => runSync();
  const intervalId = window.setInterval(runSync, 15000);

  window.addEventListener("online", onlineHandler);
  runSync();

  return () => {
    window.removeEventListener("online", onlineHandler);
    window.clearInterval(intervalId);
  };
};
