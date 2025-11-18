import {
  MEDICAL_HISTORY_STORAGE_KEY,
  MEDICAL_HISTORY_UPDATED_EVENT,
} from "./storageKeys.js";
import { readEntity, saveEntity } from "./indexedDbClient.js";

const IDB_STORE = "history";
const IDB_KEY = "records";

const isBrowser = () => typeof window !== "undefined";

const readRawHistory = () => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(MEDICAL_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    syncFromIndexedDb();
    return parsed;
  } catch (error) {
    console.warn("No se pudo leer el historial medico:", error);
    return {};
  }
};

const persistHistory = (records) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    MEDICAL_HISTORY_STORAGE_KEY,
    JSON.stringify(records),
  );
  window.dispatchEvent(new Event(MEDICAL_HISTORY_UPDATED_EVENT));
  saveEntity(IDB_STORE, IDB_KEY, records);
};

const syncFromIndexedDb = async () => {
  if (!isBrowser()) return;
  try {
    const idbValue = await readEntity(IDB_STORE, IDB_KEY);
    if (!idbValue) return;
    const raw = window.localStorage.getItem(MEDICAL_HISTORY_STORAGE_KEY);
    const localValue = raw ? JSON.parse(raw) : {};
    const isDifferent = JSON.stringify(localValue) !== JSON.stringify(idbValue);
    if (isDifferent) {
      window.localStorage.setItem(
        MEDICAL_HISTORY_STORAGE_KEY,
        JSON.stringify(idbValue),
      );
      window.dispatchEvent(new Event(MEDICAL_HISTORY_UPDATED_EVENT));
    }
  } catch (error) {
    console.warn("No se pudo sincronizar historial desde IndexedDB:", error);
  }
};

export const readEmployeeHistory = (employeeKey) => {
  if (!employeeKey) return [];
  const records = readRawHistory();
  const entries = records[employeeKey] ?? [];
  const seen = new Set();
  const deduped = [];
  entries.forEach((item) => {
    if (!item) return;
    const key = item.id || item.reference;
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    deduped.push(item);
  });
  // Si hubo duplicados, persistimos la versión limpia
  if (deduped.length !== entries.length) {
    records[employeeKey] = deduped;
    persistHistory(records);
  }
  // Orden cronológico ascendente por issued (más antiguo primero)
  return deduped.sort((a, b) => {
    const aDate = a?.issued ? new Date(a.issued).getTime() : 0;
    const bDate = b?.issued ? new Date(b.issued).getTime() : 0;
    return aDate - bDate;
  });
};

export const readAllHistory = () => readRawHistory();

export const appendEmployeeHistory = (employeeKey, record) => {
  if (!employeeKey || !record) return;
  const records = readRawHistory();
  const existing = records[employeeKey] ?? [];
  const normalizedId = record.id || record.reference;
  const next = [];
  let inserted = false;
  existing.forEach((item) => {
    if (!item) return;
    const itemKey = item.id || item.reference;
    if (normalizedId && itemKey === normalizedId) {
      // merge
      next.push({ ...item, ...record, id: normalizedId });
      inserted = true;
    } else {
      next.push(item);
    }
  });
  if (!inserted) {
    next.push({ ...record, id: normalizedId });
  }
  records[employeeKey] = next;
  persistHistory(records);
};

export const mergeHistoryPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("El historial importado debe ser un objeto valido.");
  }
  const current = readRawHistory();
  let recordsAdded = 0;
  Object.entries(payload).forEach(([employeeKey, entries]) => {
    if (!employeeKey || !Array.isArray(entries)) return;
    const safeEntries = entries.filter(
      (entry) => entry && typeof entry === "object",
    );
    if (!safeEntries.length) return;
    current[employeeKey] = [...(current[employeeKey] || []), ...safeEntries];
    recordsAdded += safeEntries.length;
  });
  persistHistory(current);
  return { employees: Object.keys(payload).length, records: recordsAdded };
};

export const importHistoryFromJSON = (text) => {
  if (!text) throw new Error("No se encontro informacion para importar.");
  const payload = JSON.parse(text);
  return mergeHistoryPayload(payload);
};

const parseCsvHistory = (text) => {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length < 2) {
    throw new Error("El CSV debe incluir encabezado y al menos una fila.");
  }
  const headers = rows[0].split(",").map((header) => header.trim());
  const required = ["employeeId", "title", "status"];
  const missing = required.filter(
    (header) => !headers.includes(header),
  );
  if (missing.length) {
    throw new Error(
      `CSV incompleto. Faltan columnas: ${missing.join(", ")}`,
    );
  }
  const getValue = (cells, name) =>
    cells[headers.indexOf(name)]?.trim() ?? "";

  const payload = {};
  rows.slice(1).forEach((row) => {
    const cells = row.split(",").map((cell) => cell.trim());
    if (!cells.length) return;
    const employeeKey = getValue(cells, "employeeId");
    if (!employeeKey) return;
    const record = {
      id: getValue(cells, "reference") || `CSV-${Date.now()}`,
      title: getValue(cells, "title") || "Sin titulo",
      issued: getValue(cells, "issued") || "",
      days: getValue(cells, "days") || "",
      status: getValue(cells, "status") || "Pendiente",
      document: getValue(cells, "document") || "",
      institution: getValue(cells, "institution") || "",
      notes: getValue(cells, "notes") || "",
      reviewer: getValue(cells, "reviewer") || "",
    };
    if (!payload[employeeKey]) payload[employeeKey] = [];
    payload[employeeKey].push(record);
  });
  return payload;
};

export const importHistoryFromCSV = (text) => {
  const payload = parseCsvHistory(text);
  return mergeHistoryPayload(payload);
};

export const exportHistoryAsJSON = () =>
  JSON.stringify(readRawHistory(), null, 2);
