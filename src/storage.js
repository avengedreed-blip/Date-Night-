// RELIABILITY: IndexedDB-based prompt persistence
// RELIABILITY: Re-export prompt store from neutral core to avoid temporal dead zones.
export { promptStore as dbStore } from './utils/promptStoreCore.js';
// RELIABILITY: Surface factory for isolated store instances when needed.
export { createPromptStore } from './utils/promptStoreCore.js';
