import { describe, expect, it } from 'vitest';
import { bytesToBase64, createMemoryPronunciationArtifactStore } from './pronunciation-artifact-store';
import type { PronunciationArtifact } from './audio-tts-provider';

function sampleArtifact(key: string): PronunciationArtifact {
  return {
    artifactKey: key,
    filename: `${key}.mp3`,
    bytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'audio/mpeg',
    extension: 'mp3',
    sampleRate: 24000,
    language: 'en',
    voiceId: 'af_heart',
    speed: 1,
  };
}

describe('createMemoryPronunciationArtifactStore', () => {
  it('stores and retrieves artifact bytes', async () => {
    const store = createMemoryPronunciationArtifactStore();
    await store.put(sampleArtifact('pron:a'));
    const entry = await store.get('pron:a');
    expect(entry?.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(entry?.filename).toBe('pron:a.mp3');
  });

  it('evicts least-recently-used unpinned preview artifacts', async () => {
    const store = createMemoryPronunciationArtifactStore({ maxUnpinnedEntries: 2 });
    await store.put(sampleArtifact('pron:1'), { now: 1 });
    await store.put(sampleArtifact('pron:2'), { now: 2 });
    await store.put(sampleArtifact('pron:3'), { now: 3 });

    expect(await store.get('pron:1')).toBeNull();
    expect(await store.get('pron:2')).not.toBeNull();
    expect(await store.get('pron:3')).not.toBeNull();
  });

  it('does not evict pinned artifacts required by the queue', async () => {
    const store = createMemoryPronunciationArtifactStore({ maxUnpinnedEntries: 1 });
    await store.put(sampleArtifact('pron:pinned'), { pinned: true, now: 1 });
    await store.put(sampleArtifact('pron:preview'), { now: 2 });
    await store.put(sampleArtifact('pron:newer'), { now: 3 });

    expect(await store.get('pron:pinned')).not.toBeNull();
    expect(await store.get('pron:preview')).toBeNull();
    expect(await store.get('pron:newer')).not.toBeNull();
  });

  it('does not unpin a queued artifact when concurrent preparation writes the same key', async () => {
    const store = createMemoryPronunciationArtifactStore();
    await store.put(sampleArtifact('pron:shared'), { pinned: true, now: 1 });

    await store.put(sampleArtifact('pron:shared'), { now: 2 });

    expect(await store.get('pron:shared')).toMatchObject({
      pinned: true,
      lastAccessedAt: 2,
    });
  });

  it('deletes artifacts that are no longer referenced', async () => {
    const store = createMemoryPronunciationArtifactStore();
    await store.put(sampleArtifact('pron:keep'));
    await store.put(sampleArtifact('pron:drop'));
    const removed = await store.deleteUnreferenced(new Set(['pron:keep']));
    expect(removed).toEqual(['pron:drop']);
    expect(await store.get('pron:drop')).toBeNull();
  });
});

describe('bytesToBase64', () => {
  it('round-trips through base64', () => {
    const bytes = new Uint8Array([0, 255, 16, 32]);
    expect(bytesToBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
  });
});
