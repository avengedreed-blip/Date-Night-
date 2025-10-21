// TRACE: module load marker
try { console.log('[INIT]', 'utils/promptStoreCore.js'); } catch {}
// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

const hasBrowserStorage = () => typeof localStorage !== 'undefined'; // RELIABILITY: Shared guard helpers for browser storage fallbacks.

const memoryFallback = {}; // RELIABILITY: In-memory persistence when localStorage is unavailable.
const fallbackSubscribers = new Set(); // [Fix PRIV-01][Fix STOR-02]
let notifiedMemoryOnly = false; // [Fix PRIV-01][Fix STOR-02]
let lastFallbackDetails = null; // [Fix PRIV-01][Fix STOR-02]

export const subscribePromptStoreFallback = (callback) => { // [Fix PRIV-01][Fix STOR-02]
  if (typeof callback !== 'function') return () => {};
  fallbackSubscribers.add(callback);
  if (lastFallbackDetails) {
    try {
      callback(lastFallbackDetails);
    } catch (err) {
      console.warn('[Reliability] Prompt fallback subscriber error:', err); // [Fix PRIV-01][Fix STOR-02]
    }
  }
  return () => {
    fallbackSubscribers.delete(callback);
  };
};

const notifyMemoryFallback = (details) => { // [Fix PRIV-01][Fix STOR-02]
  if (notifiedMemoryOnly) return;
  notifiedMemoryOnly = true;
  lastFallbackDetails = details;
  fallbackSubscribers.forEach((callback) => {
    try {
      callback(details);
    } catch (err) {
      console.warn('[Reliability] Prompt fallback subscriber error:', err); // [Fix PRIV-01][Fix STOR-02]
    }
  });
};

const persistFallback = (key, value) => { // [Fix PRIV-01][Fix STOR-02]
  const serialized = JSON.stringify(value);
  if (hasBrowserStorage()) {
    try {
      localStorage.setItem(key, serialized);
      return;
    } catch (err) {
      console.warn('[Reliability] LocalStorage fallback write failed:', err); // [Fix PRIV-01][Fix STOR-02]
    }
  }
  memoryFallback[key] = serialized;
  const exceedsSoftLimit = serialized.length > 3072; // [Fix STOR-02]
  notifyMemoryFallback({ reason: exceedsSoftLimit ? 'payload-too-large' : 'storage-unavailable' }); // [Fix PRIV-01][Fix STOR-02]
};

const readFallback = (key) => { // [Fix PRIV-01][Fix STOR-02]
  if (hasBrowserStorage()) {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw === 'string') {
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[Reliability] LocalStorage fallback read failed:', err); // [Fix PRIV-01][Fix STOR-02]
    }
  }
  try {
    const rawMemory = memoryFallback[key];
    return typeof rawMemory === 'string' ? JSON.parse(rawMemory) : undefined;
  } catch (err) {
    console.warn('[Reliability] Memory fallback parse failed:', err); // [Fix PRIV-01][Fix STOR-02]
    return undefined;
  }
};

// RELIABILITY: Hoisted factory keeps prompt store creation reusable across modules.
export function createPromptStore() {
  return {
    async getPrompt(key) {
      try {
        const value = await get(key);
        if (value !== undefined) {
          return value;
        }
      } catch (err) {
        console.warn('[Reliability] IndexedDB read failed, using fallback:', err); // [Fix H1]
      }
      return readFallback(key); // [Fix H1]
    },
    async setPrompt(key, value) {
      try {
        await set(key, value);
      } catch (err) {
        // RELIABILITY: Preserve legacy fallback semantics when IndexedDB fails.
        console.warn('[Reliability] IndexedDB write failed, fallback to memory:', err);
        persistFallback(key, value); // [Fix H1]
      }
    },
    async removePrompt(key) {
      await del(key);
    },
    async clearAll() {
      await clear();
    },
    async listKeys() {
      return await keys();
    },
  };
}

// RELIABILITY: singleton cache shared across modules without React dependency.
let _promptStoreSingleton;
// RELIABILITY: safely get shared singleton
export function getPromptStore() { // RELIABILITY: runtime guard around singleton creation
  if (!_promptStoreSingleton) { // RELIABILITY: instantiate prompt store lazily
    _promptStoreSingleton = createPromptStore(); // RELIABILITY: allocate shared store once
  }
  return _promptStoreSingleton; // RELIABILITY: reuse cached store instance
}
// RELIABILITY: lazy getter used by App via storage.js
export function getDbStoreInstance() { // RELIABILITY: neutral accessor for React surfaces
  return getPromptStore(); // RELIABILITY: delegate to singleton getter
}
