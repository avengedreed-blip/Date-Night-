// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

// RELIABILITY: Shared guard helpers for browser storage fallbacks.
const hasBrowserStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const writeBrowserFallback = (key, value) => {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[Reliability] LocalStorage fallback write failed:', err);
  }
};

// RELIABILITY: Hoisted factory keeps prompt store creation reusable across modules.
export function createPromptStore() {
  return {
    async getPrompt(key) {
      return await get(key);
    },
    async setPrompt(key, value) {
      try {
        await set(key, value);
      } catch (err) {
        // RELIABILITY: Preserve legacy fallback semantics when IndexedDB fails.
        console.warn('[Reliability] IndexedDB write failed, fallback to memory:', err);
        writeBrowserFallback(key, value);
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

// RELIABILITY: deferred singleton to avoid TDZ when modules import each other.
let promptStoreSingleton;
export const getPromptStore = () => {
  if (!promptStoreSingleton) {
    promptStoreSingleton = createPromptStore();
  }
  return promptStoreSingleton;
};

// RELIABILITY: maintain existing singleton export for legacy callers without eager instantiation.
export const promptStore = new Proxy({}, {
  get(_target, prop) {
    const store = getPromptStore();
    const value = store[prop];
    if (typeof value === 'function') {
      return value.bind(store);
    }
    return value;
  }
});
