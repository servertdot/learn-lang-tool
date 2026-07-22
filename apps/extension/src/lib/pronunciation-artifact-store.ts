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
        pinned: putOptions.pinned ?? false,
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

/** Encode mono PCM16 samples as a WAV container. */
export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export type { PronunciationRequest };
