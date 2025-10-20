// TRACE: module load marker
try { console.log('[INIT]', 'storage.js'); } catch {}
import { getPromptStore, getDbStoreInstance } from './utils/promptStoreCore.js'; // RELIABILITY: import from neutral core only

export const getDbStore = () => getDbStoreInstance(); // RELIABILITY: main export for App and others

export const dbStore = getPromptStore(); // RELIABILITY: legacy singleton (kept for backward compatibility)

export { createPromptStore } from './utils/promptStoreCore.js'; // ARCH: keep old named exports for compatibility
