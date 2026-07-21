import browser from 'webextension-polyfill';
import type { ModelPackInstallState, ModelPackPersistence } from './model-pack-store';

const STORAGE_PREFIX = 'modelPack:';

export function createChromeModelPackPersistence(): ModelPackPersistence {
  return {
    async get(id) {
      const key = STORAGE_PREFIX + id;
      const result = await browser.storage.local.get(key);
      return (result[key] as ModelPackInstallState | undefined) ?? null;
    },
    async set(id, state) {
      await browser.storage.local.set({ [STORAGE_PREFIX + id]: state });
    },
    async remove(id) {
      await browser.storage.local.remove(STORAGE_PREFIX + id);
    },
  };
}
