import type { PronunciationArtifact, PronunciationRequest } from './audio-tts-provider';

export type ArtifactStoreEntry = {
  artifactKey: string;
  filename: string;
  mimeType: string;
  extension: string;
  sampleRate: number;
  language: string;
  voiceId: string;
  speed: number;
  bytes: Uint8Array;
  pinned: boolean;
  lastAccessedAt: number;
};

export interface PronunciationArtifactStore {
  get(artifactKey: string): Promise<ArtifactStoreEntry | null>;
  put(
    artifact: PronunciationArtifact,
    options?: { pinned?: boolean; now?: number },
  ): Promise<void>;
  pin(artifactKey: string): Promise<void>;
  unpin(artifactKey: string): Promise<void>;
  touch(artifactKey: string, now?: number): Promise<void>;
  delete(artifactKey: string): Promise<void>;
  deleteUnreferenced(referencedKeys: ReadonlySet<string>): Promise<string[]>;
  listKeys(): Promise<string[]>;
}

export interface MemoryArtifactStoreOptions {
  /** Max unpinned (preview-only) entries retained by LRU. */
  maxUnpinnedEntries?: number;
}

/**
 * In-memory artifact store used by tests and as the contract reference.
 * Production uses IndexedDB / Cache API backed implementation.
 */
export function createMemoryPronunciationArtifactStore(
  options: MemoryArtifactStoreOptions = {},
): PronunciationArtifactStore {
  const maxUnpinned = options.maxUnpinnedEntries ?? 32;
  const entries = new Map<string, ArtifactStoreEntry>();

  function evictIfNeeded(): void {
    const unpinned = [...entries.values()]
      .filter(entry => !entry.pinned)
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    while (unpinned.length > maxUnpinned) {
      const oldest = unpinned.shift();
      if (!oldest) break;
      entries.delete(oldest.artifactKey);
    }
  }

  return {
    async get(artifactKey) {
      const entry = entries.get(artifactKey);
      return entry ? { ...entry, bytes: entry.bytes.slice() } : null;
    },
    async put(artifact, putOptions = {}) {
      const existing = entries.get(artifact.artifactKey);
      entries.set(artifact.artifactKey, {
        artifactKey: artifact.artifactKey,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        extension: artifact.extension,
        sampleRate: artifact.sampleRate,
        language: artifact.language,
        voiceId: artifact.voiceId,
        speed: artifact.speed,
        bytes: artifact.bytes.slice(),
        // Only unpin through unpin(); a concurrent preview write must not downgrade queue data.
        pinned: existing?.pinned === true || putOptions.pinned === true,
        lastAccessedAt: putOptions.now ?? Date.now(),
      });
      evictIfNeeded();
    },
    async pin(artifactKey) {
      const entry = entries.get(artifactKey);
      if (entry) entry.pinned = true;
    },
    async unpin(artifactKey) {
      const entry = entries.get(artifactKey);
      if (entry) entry.pinned = false;
      evictIfNeeded();
    },
    async touch(artifactKey, now = Date.now()) {
      const entry = entries.get(artifactKey);
      if (entry) entry.lastAccessedAt = now;
    },
    async delete(artifactKey) {
      entries.delete(artifactKey);
    },
    async deleteUnreferenced(referencedKeys) {
      const removed: string[] = [];
      for (const key of [...entries.keys()]) {
        if (!referencedKeys.has(key)) {
          entries.delete(key);
          removed.push(key);
        }
      }
      return removed;
    },
    async listKeys() {
      return [...entries.keys()];
    },
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type { PronunciationRequest };
