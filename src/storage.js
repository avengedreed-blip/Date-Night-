// RELIABILITY: IndexedDB-based prompt persistence
import { createPromptStore, getPromptStore } from './utils/promptStoreCore.js';

// RELIABILITY: Provide lazy getter so consumers defer prompt store access until runtime.
export const getDbStore = () => getPromptStore();

// RELIABILITY: Maintain legacy singleton export for existing import sites.
export const dbStore = getPromptStore();

// RELIABILITY: Surface factory for isolated store instances when needed.
export { createPromptStore };
