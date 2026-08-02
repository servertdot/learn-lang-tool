import { describe, expect, it, vi } from 'vitest';
import { AnkiQueue, type AnkiQueueStorage } from './anki-queue';
import { createMemoryPronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  cancelPronunciationPrepare,
  discardPronunciationSession,
  preparePronunciation,
  type PronunciationRuntimeDependencies,
} from './pronunciation-runtime';

function runtime(requestId: string) {
  const artifactStore = createMemoryPronunciationArtifactStore();
  const storage: AnkiQueueStorage = {
    read: async () => [],
    write: async () => undefined,
  };
  const dependencies = {
    artifactStore,
    ankiQueue: new AnkiQueue(storage),
    speechPackStore: { getStatus: async () => 'ready' },
    ensureOffscreenDocument: vi.fn().mockResolvedValue(undefined),
    sendToOffscreen: vi.fn().mockResolvedValue({
      ok: true,
      artifact: {
        artifactKey: 'provider-key',
        filename: 'provider.mp3',
        dataBase64: btoa(String.fromCharCode(1, 2, 3)),
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        sampleRate: 24_000,
        language: 'en',
        voiceId: 'google-translate-web:en',
        speed: 1,
      },
    }),
  } as unknown as PronunciationRuntimeDependencies;
  return {
    input: {
      requestId,
      text: 'hello',
      language: 'en',
      translationProvider: 'google' as const,
      purpose: 'preview' as const,
    },
    artifactStore,
    dependencies,
  };
}

describe('pronunciation preview artifact lifecycle', () => {
  it('keeps session bytes when Stop cancels work so replay can reuse them', async () => {
    const fixture = runtime('stop-preview');
    const state = await preparePronunciation(fixture.input, fixture.dependencies);

    cancelPronunciationPrepare(fixture.input.requestId);

    expect(await fixture.artifactStore.get(state.artifactKey!)).not.toBeNull();
    await discardPronunciationSession(fixture.input.requestId, fixture.dependencies);
  });

  it('discards unpinned preview bytes when the active result is dismissed', async () => {
    const fixture = runtime('dismiss-preview');
    const state = await preparePronunciation(fixture.input, fixture.dependencies);
    expect(await fixture.artifactStore.get(state.artifactKey!)).not.toBeNull();

    await discardPronunciationSession(fixture.input.requestId, fixture.dependencies);

    expect(await fixture.artifactStore.get(state.artifactKey!)).toBeNull();
  });

  it('keeps a preview artifact after Add promotes it to a pinned queue artifact', async () => {
    const fixture = runtime('promote-preview');
    const state = await preparePronunciation(fixture.input, fixture.dependencies);
    await fixture.artifactStore.pin(state.artifactKey!);

    await discardPronunciationSession(fixture.input.requestId, fixture.dependencies);

    expect((await fixture.artifactStore.get(state.artifactKey!))?.pinned).toBe(true);
  });
});
