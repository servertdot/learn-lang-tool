import type { PronunciationArtifact } from './audio-tts-provider';
import {
  base64ToBytes,
  bytesToBase64,
  type ArtifactStoreEntry,
  type PronunciationArtifactStore,
} from './pronunciation-artifact-store';

const DB_NAME = 'llt-pronunciation-artifacts';
const DB_VERSION = 1;
const STORE_NAME = 'artifacts';
const META_KEY = 'pronunciationArtifacts.meta.v1';

type StoredRecord = {
  artifactKey: string;
  filename: string;
  mimeType: string;
  extension: string;
  sampleRate: number;
  language: string;
  voiceId: string;
  speed: number;
  /** Base64-encoded audio bytes (IndexedDB-friendly). */
  dataBase64: string;
  pinned: boolean;
  lastAccessedAt: number;
};

type MetaState = {
  maxUnpinnedEntries: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'artifactKey' });
      }
    };
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function readMeta(): Promise<MetaState> {
  const stored = await chrome.storage.local.get(META_KEY);
  const value = stored[META_KEY] as MetaState | undefined;
  return { maxUnpinnedEntries: value?.maxUnpinnedEntries ?? 32 };
}

function toEntry(record: StoredRecord): ArtifactStoreEntry {
  return {
    artifactKey: record.artifactKey,
    filename: record.filename,
    mimeType: record.mimeType,
    extension: record.extension,
    sampleRate: record.sampleRate,
    language: record.language,
    voiceId: record.voiceId,
    speed: record.speed,
    bytes: base64ToBytes(record.dataBase64),
    pinned: record.pinned,
    lastAccessedAt: record.lastAccessedAt,
  };
}

async function evictUnpinned(db: IDBDatabase, maxUnpinned: number): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const all = (await idbRequest(store.getAll())) as StoredRecord[];
  const unpinned = all
    .filter(record => !record.pinned)
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  while (unpinned.length > maxUnpinned) {
    const oldest = unpinned.shift();
    if (!oldest) break;
    store.delete(oldest.artifactKey);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB eviction failed'));
  });
}

/**
 * Durable pronunciation artifact store backed by IndexedDB.
 * Queue-referenced artifacts are pinned; preview-only entries follow LRU.
 */
export function createIndexedDbPronunciationArtifactStore(): PronunciationArtifactStore {
  return {
    async get(artifactKey) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const record = (await idbRequest(
          tx.objectStore(STORE_NAME).get(artifactKey),
        )) as StoredRecord | undefined;
        return record ? toEntry(record) : null;
      } finally {
        db.close();
      }
    },
    async put(artifact, options = {}) {
      const db = await openDb();
      try {
        const meta = await readMeta();
        const record: StoredRecord = {
          artifactKey: artifact.artifactKey,
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          extension: artifact.extension,
          sampleRate: artifact.sampleRate,
          language: artifact.language,
          voiceId: artifact.voiceId,
          speed: artifact.speed,
          dataBase64: bytesToBase64(artifact.bytes),
          pinned: options.pinned ?? false,
          lastAccessedAt: options.now ?? Date.now(),
        };
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
        });
        await evictUnpinned(db, meta.maxUnpinnedEntries);
      } finally {
        db.close();
      }
    },
    async pin(artifactKey) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = (await idbRequest(store.get(artifactKey))) as StoredRecord | undefined;
        if (record) {
          record.pinned = true;
          store.put(record);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB pin failed'));
        });
      } finally {
        db.close();
      }
    },
    async unpin(artifactKey) {
      const db = await openDb();
      try {
        const meta = await readMeta();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = (await idbRequest(store.get(artifactKey))) as StoredRecord | undefined;
        if (record) {
          record.pinned = false;
          store.put(record);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB unpin failed'));
        });
        await evictUnpinned(db, meta.maxUnpinnedEntries);
      } finally {
        db.close();
      }
    },
    async touch(artifactKey, now = Date.now()) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = (await idbRequest(store.get(artifactKey))) as StoredRecord | undefined;
        if (record) {
          record.lastAccessedAt = now;
          store.put(record);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB touch failed'));
        });
      } finally {
        db.close();
      }
    },
    async delete(artifactKey) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(artifactKey);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
        });
      } finally {
        db.close();
      }
    },
    async deleteUnreferenced(referencedKeys) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const all = (await idbRequest(store.getAll())) as StoredRecord[];
        const removed: string[] = [];
        for (const record of all) {
          if (!referencedKeys.has(record.artifactKey)) {
            store.delete(record.artifactKey);
            removed.push(record.artifactKey);
          }
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB cleanup failed'));
        });
        return removed;
      } finally {
        db.close();
      }
    },
    async listKeys() {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const keys = await idbRequest(tx.objectStore(STORE_NAME).getAllKeys());
        return keys.map(String);
      } finally {
        db.close();
      }
    },
  };
}

export type { PronunciationArtifact };
