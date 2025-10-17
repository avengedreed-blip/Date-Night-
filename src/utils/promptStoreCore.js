// TRACE: module load marker
try { console.log('[INIT]', 'utils/promptStoreCore.js'); } catch {}
// RELIABILITY: Core prompt persistence helpers extracted to eliminate circular evaluation risk.
import { get, set, del, clear, keys } from 'idb-keyval';

const hasBrowserStorage = () => typeof localStorage !== 'undefined'; // RELIABILITY: Shared guard helpers for browser storage fallbacks.

const memoryFallback = {}; // RELIABILITY: In-memory persistence when localStorage is unavailable.

const writeBrowserFallback = (key, value) => { // RELIABILITY: Guarded localStorage writes with memory fallback.
  if (hasBrowserStorage()) { // RELIABILITY: localStorage available branch.
    try { // RELIABILITY: Preserve error diagnostics for storage quota failures.
      localStorage.setItem(key, JSON.stringify(value)); // RELIABILITY: Persist serialized prompt payload for legacy callers.
    } catch (err) { // RELIABILITY: Capture storage exceptions for debugging visibility.
      console.warn('[Reliability] LocalStorage fallback write failed:', err); // RELIABILITY: Log guard for observability.
      memoryFallback[key] = JSON.stringify(value); // RELIABILITY: Record value in memory fallback when disk quota is hit.
    }
    return; // RELIABILITY: Exit after attempting browser storage write path.
  }
  memoryFallback[key] = JSON.stringify(value); // RELIABILITY: Store serialized prompts in memory when localStorage is missing.
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

let promptStoreSingleton; // RELIABILITY: deferred singleton to avoid TDZ when modules import each other.
export const getPromptStore = () => { // RELIABILITY: Lazy getter ensures runtime initialization only.
  if (!promptStoreSingleton) { // RELIABILITY: Instantiate store once on first access.
    promptStoreSingleton = createPromptStore(); // RELIABILITY: Capture singleton instance lazily.
  }
  return promptStoreSingleton; // RELIABILITY: Return memoized prompt store instance.
};

// RELIABILITY: remove eager singleton export to prevent TDZ re-entry.
