// RELIABILITY: IndexedDB-based prompt persistence
import { createPromptStore, getPromptStore } from './utils/promptStoreCore.js';

// RELIABILITY: Memoized cache for prompt store instance to prevent eager initialization.
let cachedStore;

// RELIABILITY: Provide lazy getter so consumers defer prompt store access until runtime.
export const getDbStore = () => {
  if (!cachedStore) {
    cachedStore = getPromptStore();
  }
  return cachedStore;
};

// RELIABILITY: Maintain legacy singleton export without triggering eager store creation.
export const dbStore = new Proxy({}, {
  get(_target, prop) {
    const store = getDbStore();
    const value = store[prop];
    if (typeof value === 'function') {
      return value.bind(store);
    }
    return value;
  }
});

// RELIABILITY: Surface factory for isolated store instances when needed.
export { createPromptStore };
