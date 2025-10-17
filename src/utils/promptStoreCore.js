// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

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
        localStorage.setItem(key, JSON.stringify(value));
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

// RELIABILITY: maintain existing singleton export for legacy callers.
export const promptStore = getPromptStore();
