// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

// RELIABILITY: Factory to build an isolated prompt store instance.
export const createPromptStore = () => ({
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
});

// RELIABILITY: Shared singleton used by legacy storage import.
export const promptStore = createPromptStore();
