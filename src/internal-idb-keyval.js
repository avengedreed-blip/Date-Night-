// TRACE: module load marker
try { console.log('[INIT]', 'internal-idb-keyval.js'); } catch {}
// RELIABILITY: Local shim replicating idb-keyval primitives without external deps.

// RELIABILITY: Dedicated database and store names for prompt persistence.
const DB_NAME = 'prompt-keyval';
const STORE_NAME = 'prompts';

const supportsIndexedDB = typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'; // [Fix PKG-001]
const memoryFallback = new Map(); // [Fix PKG-001] Fallback cache when IndexedDB is unavailable

const openDatabase = () => new Promise((resolve, reject) => {
  try {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => {
      console.warn('[Reliability] IndexedDB upgrade blocked');
    };
  } catch (err) {
    reject(err);
  }
});

const dbPromise = supportsIndexedDB
  ? openDatabase().catch((err) => {
      console.warn('[Reliability] Falling back to in-memory prompt cache:', err); // [Fix PKG-001]
      return null;
    })
  : Promise.resolve(null);

const runStoreTask = async (mode, idbTask, memoryTask) => {
  const db = await dbPromise;
  if (!db) {
    return memoryTask();
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = idbTask(store);
      if (!request) {
        resolve(undefined);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    } catch (err) {
      reject(err);
    }
  });
};

// RELIABILITY: Align exported helpers with idb-keyval signature.
export const get = async (key) => runStoreTask('readonly', (store) => store.get(key), () => memoryFallback.get(key));
export const set = async (key, value) => runStoreTask('readwrite', (store) => store.put(value, key), () => { memoryFallback.set(key, value); return value; });
export const del = async (key) => runStoreTask('readwrite', (store) => store.delete(key), () => { memoryFallback.delete(key); return undefined; });
export const clear = async () => runStoreTask('readwrite', (store) => store.clear(), () => { memoryFallback.clear(); return undefined; });
export const keys = async () => runStoreTask('readonly', (store) => store.getAllKeys(), () => Array.from(memoryFallback.keys()));
