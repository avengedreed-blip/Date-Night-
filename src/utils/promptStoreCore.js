// TRACE: module load marker
try { console.log('[INIT]', 'utils/promptStoreCore.js'); } catch {}
// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

const hasBrowserStorage = () => typeof localStorage !== 'undefined'; // RELIABILITY: Shared guard helpers for browser storage fallbacks.

const memoryFallback = {}; // RELIABILITY: In-memory persistence when localStorage is unavailable.
const COOKIE_PREFIX = 'dn_prompt_'; // [Fix H1]

const persistCookieFallback = (key, serialized) => { // [Fix H1]
  if (typeof document === 'undefined') {
    memoryFallback[key] = serialized;
    return;
  }
  try {
    document.cookie = `${COOKIE_PREFIX}${encodeURIComponent(key)}=${encodeURIComponent(serialized)};path=/;max-age=31536000;SameSite=Lax`; // [Fix H1]
  } catch (err) {
    console.warn('[Reliability] Cookie fallback write failed:', err); // [Fix H1]
    memoryFallback[key] = serialized;
  }
};

const persistFallback = (key, value) => { // [Fix H1]
  const serialized = JSON.stringify(value);
  if (hasBrowserStorage()) {
    try {
      localStorage.setItem(key, serialized); // [Fix H1]
      return;
    } catch (err) {
      console.warn('[Reliability] LocalStorage fallback write failed:', err); // [Fix H1]
    }
  }
  persistCookieFallback(key, serialized); // [Fix H1]
};

const readFallback = (key) => { // [Fix H1]
  if (hasBrowserStorage()) {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw === 'string') {
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[Reliability] LocalStorage fallback read failed:', err); // [Fix H1]
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const target = `${COOKIE_PREFIX}${encodeURIComponent(key)}=`;
      const cookie = document.cookie.split(';').map((c) => c.trim()).find((entry) => entry.startsWith(target));
      if (cookie) {
        const value = decodeURIComponent(cookie.substring(target.length));
        return JSON.parse(value);
      }
    } catch (err) {
      console.warn('[Reliability] Cookie fallback read failed:', err); // [Fix H1]
    }
  }
  try {
    const rawMemory = memoryFallback[key];
    return typeof rawMemory === 'string' ? JSON.parse(rawMemory) : undefined;
  } catch (err) {
    console.warn('[Reliability] Memory fallback parse failed:', err); // [Fix H1]
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
