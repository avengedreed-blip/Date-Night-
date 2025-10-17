// TRACE: module load marker
try { console.log('[INIT]', 'internal-idb-keyval.js'); } catch {}
// RELIABILITY: Local shim replicating idb-keyval primitives via idb.
import { openDB } from 'idb';

// RELIABILITY: Dedicated database and store names for prompt persistence.
const DB_NAME = 'prompt-keyval';
const STORE_NAME = 'prompts';

// RELIABILITY: Shared database promise mirroring idb-keyval behavior.
const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  },
});

// RELIABILITY: Align exported helpers with idb-keyval signature.
export const get = async (key) => (await dbPromise).get(STORE_NAME, key);
export const set = async (key, value) => (await dbPromise).put(STORE_NAME, value, key);
export const del = async (key) => (await dbPromise).delete(STORE_NAME, key);
export const clear = async () => (await dbPromise).clear(STORE_NAME);
export const keys = async () => (await dbPromise).getAllKeys(STORE_NAME);
