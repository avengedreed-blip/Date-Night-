import { createPromptStore, getPromptStore } from './utils/promptStoreCore.js'; // RELIABILITY: IndexedDB prompt storage accessor only

export const getDbStore = () => getPromptStore(); // RELIABILITY: expose only the lazy getter

export { createPromptStore }; // RELIABILITY: expose factory for isolated test instances
