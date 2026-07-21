import { describe, it, expect, beforeEach } from 'vitest';
import {
  createModelPackStore,
  type ModelPackPersistence,
  type ModelPackInstallState,
} from './model-pack-store';

function memoryPersistence(initial: Record<string, ModelPackInstallState> = {}): ModelPackPersistence {
  const data = { ...initial };
  return {
    async get(id) {
      return data[id] ?? null;
    },
    async set(id, state) {
      data[id] = state;
    },
    async remove(id) {
      delete data[id];
    },
  };
}

describe('model pack store', () => {
  let persistence: ModelPackPersistence;

  beforeEach(() => {
    persistence = memoryPersistence();
  });

  it('reports missing when nothing is stored', async () => {
    const store = createModelPackStore(persistence);
    expect(await store.getStatus('en-ru')).toBe('missing');
  });

  it('persists ready status across reads', async () => {
    const store = createModelPackStore(persistence);
    await store.markReady('en-ru');
    expect(await store.getStatus('en-ru')).toBe('ready');
  });

  it('does not mark ready after cancel while downloading', async () => {
    const store = createModelPackStore(persistence);
    await store.markDownloading('en-ru');
    await store.markCancelled('en-ru');
    expect(await store.getStatus('en-ru')).toBe('missing');
  });

  it('marks failed without leaving ready', async () => {
    const store = createModelPackStore(persistence);
    await store.markDownloading('en-ru');
    await store.markFailed('en-ru', 'network');
    expect(await store.getStatus('en-ru')).toBe('failed');
  });

  it('allows retry after failure by clearing to missing then downloading', async () => {
    const store = createModelPackStore(persistence);
    await store.markFailed('en-ru', 'network');
    await store.markDownloading('en-ru');
    expect(await store.getStatus('en-ru')).toBe('downloading');
  });
});
