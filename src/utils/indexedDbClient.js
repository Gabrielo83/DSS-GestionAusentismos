const DB_NAME = "dss-salud-ocupacional";
const DB_VERSION = 2;
const STORE_NAMES = ["validations", "history", "plans", "drafts", "queue"];

let dbPromise = null;
const hasIndexedDb = typeof indexedDB !== "undefined";

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORE_NAMES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const getDb = () => {
  if (!hasIndexedDb) return Promise.reject(new Error("indexedDB not supported"));
  if (dbPromise) return dbPromise;
  dbPromise = openDatabase();
  return dbPromise;
};

const withTx = async (storeName, mode, callback) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
};

export const saveEntity = async (storeName, key, value) =>
  hasIndexedDb
    ? withTx(storeName, "readwrite", (store) => store.put(value, key)).catch(
        (error) =>
          console.warn(`IDB save failed (${storeName}/${key}):`, error),
      )
    : Promise.resolve();

export const readEntity = async (storeName, key) =>
  hasIndexedDb
    ? withTx(storeName, "readonly", (store) => store.get(key)).catch(
        (error) => {
          console.warn(`IDB read failed (${storeName}/${key}):`, error);
          return null;
        },
      )
    : Promise.resolve(null);

export const deleteEntity = async (storeName, key) =>
  hasIndexedDb
    ? withTx(storeName, "readwrite", (store) => store.delete(key)).catch(
        (error) =>
          console.warn(`IDB delete failed (${storeName}/${key}):`, error),
      )
    : Promise.resolve();

export const readAllEntities = async (storeName) =>
  hasIndexedDb
    ? withTx(storeName, "readonly", (store) => store.getAll()).catch(
        (error) => {
          console.warn(`IDB readAll failed (${storeName}):`, error);
          return [];
        },
      )
    : Promise.resolve([]);
