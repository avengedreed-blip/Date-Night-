// RELIABILITY: IndexedDB-based prompt persistence
import { get, set, del, clear, keys } from 'idb-keyval';

// RELIABILITY: Unified async storage helpers for prompt data.
export const dbStore = {
  async getPrompt(key) {
    return await get(key);
  },
  async setPrompt(key, value) {
    try {
      await set(key, value);
    } catch (err) {
      // RELIABILITY: log IndexedDB failures and trigger legacy fallback.
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
