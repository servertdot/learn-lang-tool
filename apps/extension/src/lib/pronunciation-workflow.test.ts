import { describe, expect, it, vi } from 'vitest';
import type { TranslationProvider } from '@package/shared';
import {
  TtsError,
  type PronunciationArtifact,
  type PronunciationRequest,
} from './audio-tts-provider';
import { createAnkiNote, DEFAULT_ANKI_SETTINGS } from './anki';
import { AnkiQueue, type AnkiQueueStorage } from './anki-queue';
import { syncAnkiQueue } from './anki-queue-sync';
import { createMemoryPronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  enqueueCardWithRequiredAudio,
  fulfillQueuedPronunciation,
  runPronunciationWorkflow,
  type PronunciationWorkflowDependencies,
  type PronunciationWorkflowInput,
} from './pronunciation-workflow';

function createMemoryStorage(): AnkiQueueStorage & { value: unknown } {
  return {
    value: [],
    async read() {
      return this.value;
    },
    async write(items) {
      this.value = items;
    },
  };
}

function input(
  overrides: Partial<PronunciationWorkflowInput> = {},
): PronunciationWorkflowInput {
  return {
    requestId: 'request-1',
    text: 'hello',
    language: 'en',
    translationProvider: 'google',
    purpose: 'preview',
    ...overrides,
  };
}

function fakeArtifact(request: PronunciationRequest): PronunciationArtifact {
  return {
    artifactKey: 'pending',
    filename: 'pending.mp3',
    bytes: new Uint8Array([9, 9, 9]),
    mimeType: 'audio/mpeg',
    extension: 'mp3',
    sampleRate: 24_000,
    language: request.language,
    voiceId: request.voiceId,
    speed: request.speed,
  };
}

function dependencies(
  overrides: Partial<PronunciationWorkflowDependencies> = {},
): PronunciationWorkflowDependencies {
  return {
    artifactStore: createMemoryPronunciationArtifactStore(),
    getSpeechPackStatus: async () => 'ready',
    synthesize: async request => fakeArtifact(request),
    ...overrides,
  };
}

describe('runPronunciationWorkflow', () => {
  it('plays a Google artifact and never invokes Kokoro or Web Speech after success', async () => {
    const synthesize = vi.fn(async request => fakeArtifact(request));
    const playArtifact = vi.fn().mockResolvedValue(undefined);
    const playWebSpeech = vi.fn();

    const state = await runPronunciationWorkflow(
      input({ text: 'exact visible text' }),
      dependencies({ synthesize, playArtifact, playWebSpeech }),
    );

    expect(state).toMatchObject({
      uiState: 'stopped',
      providerId: 'google-translate-web',
      playbackKind: 'artifact',
    });
    expect(synthesize).toHaveBeenCalledOnce();
    expect(synthesize.mock.calls[0][0]).toMatchObject({
      text: 'exact visible text',
      providerId: 'google-translate-web',
    });
    expect(playArtifact).toHaveBeenCalledOnce();
    expect(playWebSpeech).not.toHaveBeenCalled();
  });

  it('restarts the complete text with Kokoro after a fallback-worthy Google failure', async () => {
    const synthesize = vi.fn(async (request: PronunciationRequest) => {
      if (request.providerId === 'google-translate-web') {
        throw new TtsError('generation_failed', 'remote unavailable');
      }
      return fakeArtifact(request);
    });

    const state = await runPronunciationWorkflow(
      input({ text: 'the complete original text' }),
      dependencies({ synthesize }),
    );

    expect(state).toMatchObject({ uiState: 'ready', providerId: 'kokoro' });
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(synthesize.mock.calls.map(call => call[0].text)).toEqual([
      'the complete original text',
      'the complete original text',
    ]);
  });

  it('skips a missing Kokoro pack during preview and uses Web Speech without prompting', async () => {
    const synthesize = vi.fn<PronunciationWorkflowDependencies['synthesize']>(async () => {
      throw new TtsError('generation_failed', 'remote unavailable');
    });
    const playWebSpeech = vi.fn().mockResolvedValue(undefined);

    const state = await runPronunciationWorkflow(
      input(),
      dependencies({
        synthesize,
        getSpeechPackStatus: async () => 'missing',
        playWebSpeech,
      }),
    );

    expect(state).toMatchObject({
      uiState: 'stopped',
      playbackKind: 'web_speech',
      providerId: 'web-speech',
    });
    expect(synthesize).toHaveBeenCalledOnce();
    expect(synthesize.mock.calls.some(call => call[0].providerId === 'kokoro')).toBe(false);
    expect(playWebSpeech).toHaveBeenCalledWith('hello', 'en', expect.any(AbortSignal));
    expect(state.speechModelPackId).toBeUndefined();
  });

  it('uses Web Speech when Google and ready Kokoro both fail', async () => {
    const synthesize = vi.fn(async () => {
      throw new TtsError('generation_failed', 'provider failed');
    });
    const playWebSpeech = vi.fn().mockResolvedValue(undefined);

    const state = await runPronunciationWorkflow(
      input(),
      dependencies({ synthesize, playWebSpeech }),
    );

    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(playWebSpeech).toHaveBeenCalledOnce();
    expect(state.uiState).toBe('stopped');
  });

  it.each([
    ['preview', 'google', ['google-translate-web', 'kokoro'], true],
    ['anki', 'google', ['google-translate-web', 'kokoro'], false],
    ['preview', 'bergamot', ['kokoro'], true],
    ['anki', 'bergamot', ['kokoro'], false],
  ] as const)(
    'routes %s with %s through the fixed policy',
    async (purpose, translationProvider, expectedProviders, allowsWebSpeech) => {
      const synthesize = vi.fn<PronunciationWorkflowDependencies['synthesize']>(async () => {
        throw new TtsError('generation_failed', 'failed');
      });
      const playWebSpeech = vi.fn().mockResolvedValue(undefined);

      await runPronunciationWorkflow(
        input({ purpose, translationProvider }),
        dependencies({ synthesize, playWebSpeech }),
      );

      expect(synthesize.mock.calls.map(call => call[0].providerId)).toEqual(expectedProviders);
      expect(playWebSpeech).toHaveBeenCalledTimes(allowsWebSpeech ? 1 : 0);
    },
  );

  it('never invokes Google for Bergamot even when every local preview capability fails', async () => {
    const synthesize = vi.fn<PronunciationWorkflowDependencies['synthesize']>(async () => {
      throw new TtsError('generation_failed', 'local failed');
    });
    const playWebSpeech = vi.fn().mockRejectedValue(new Error('browser speech failed'));

    const state = await runPronunciationWorkflow(
      input({ translationProvider: 'bergamot' }),
      dependencies({ synthesize, playWebSpeech }),
    );

    expect(synthesize.mock.calls.map(call => call[0].providerId)).toEqual(['kokoro']);
    expect(state).toMatchObject({ uiState: 'failed', errorCode: 'generation_failed' });
  });

  it('returns a Kokoro consent state for Anki instead of substituting Web Speech', async () => {
    const playWebSpeech = vi.fn();
    const state = await runPronunciationWorkflow(
      input({ purpose: 'anki' }),
      dependencies({
        synthesize: async request => {
          if (request.providerId === 'google-translate-web') {
            throw new TtsError('generation_failed', 'remote unavailable');
          }
          return fakeArtifact(request);
        },
        getSpeechPackStatus: async () => 'missing',
        playWebSpeech,
      }),
    );

    expect(state).toMatchObject({
      uiState: 'pack_missing',
      speechModelPackId: 'kokoro-en-v1.0',
    });
    expect(state.pronunciationRequests?.map(request => request.providerId)).toEqual([
      'google-translate-web',
      'kokoro',
    ]);
    expect(playWebSpeech).not.toHaveBeenCalled();
  });

  it('treats deliberate cancellation as terminal and never falls back', async () => {
    const controller = new AbortController();
    const synthesize = vi.fn((_request: PronunciationRequest, signal?: AbortSignal) =>
      new Promise<PronunciationArtifact>((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new TtsError('request_cancelled', 'cancelled')),
        );
      }),
    );
    const playWebSpeech = vi.fn();

    const pending = runPronunciationWorkflow(
      input(),
      dependencies({ synthesize, playWebSpeech }),
      controller.signal,
    );
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      uiState: 'stopped',
      errorCode: 'request_cancelled',
    });
    expect(synthesize.mock.calls.length).toBeLessThanOrEqual(1);
    expect(synthesize.mock.calls.some(call => call[0].providerId === 'kokoro')).toBe(false);
    expect(playWebSpeech).not.toHaveBeenCalled();
  });

  it('reuses a cached artifact for replay in the same active result', async () => {
    const store = createMemoryPronunciationArtifactStore();
    const synthesize = vi.fn(async request => fakeArtifact(request));
    const playArtifact = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({ artifactStore: store, synthesize, playArtifact });

    await runPronunciationWorkflow(input(), deps);
    await runPronunciationWorkflow(input(), deps);

    expect(synthesize).toHaveBeenCalledOnce();
    expect(playArtifact).toHaveBeenCalledTimes(2);
  });

  it('uses the requested original or translated exact text and language independently', async () => {
    const synthesize = vi.fn(async request => fakeArtifact(request));

    await runPronunciationWorkflow(
      input({ text: 'source only', language: 'en' }),
      dependencies({ synthesize }),
    );
    await runPronunciationWorkflow(
      input({ text: 'traducción only', language: 'es' }),
      dependencies({ synthesize }),
    );

    expect(synthesize.mock.calls[0][0]).toMatchObject({ text: 'source only', language: 'en' });
    expect(synthesize.mock.calls[1][0]).toMatchObject({ text: 'traducción only', language: 'es' });
  });
});

describe('queue-first pronunciation and Anki sync', () => {
  const note = createAnkiNote(DEFAULT_ANKI_SETTINGS, {
    textFrom: 'hello',
    textTo: 'привет',
    sentence: 'hello',
  });
  const googleRequest = {
    text: 'hello',
    language: 'en',
    providerId: 'google-translate-web',
    providerRevision: 'translate-tts-v1-mp3-assembly-v1',
    voiceId: 'google-translate-web:en',
    speed: 1,
    encodingVersion: 2,
  };
  const kokoroRequest = {
    text: 'hello',
    language: 'en',
    providerId: 'kokoro',
    providerRevision: 'v1.0',
    voiceId: 'af_heart',
    speed: 1,
    encodingVersion: 2,
  };

  it('queues while preparing and later fulfills in durable provider order', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'q1' });
    const store = createMemoryPronunciationArtifactStore();
    await enqueueCardWithRequiredAudio(queue, {
      note,
      pronunciationRequests: [googleRequest, kokoroRequest],
    });

    const addNote = vi.fn();
    const blocked = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn(),
      addNote,
      artifactStore: store,
      audioFieldsForNote: () => ['Reading'],
    });
    expect(addNote).not.toHaveBeenCalled();
    expect(blocked.error).toMatch(/Waiting for pronunciation/);

    const synthesize = vi.fn(async (request: PronunciationRequest) => {
      if (request.providerId === 'google-translate-web') {
        throw new TtsError('generation_failed', 'remote failed');
      }
      return fakeArtifact(request);
    });
    await fulfillQueuedPronunciation(
      queue,
      dependencies({ artifactStore: store, synthesize }),
    );

    expect(synthesize.mock.calls.map(call => call[0].providerId)).toEqual([
      'google-translate-web',
      'kokoro',
    ]);
    expect((await queue.list())[0]).toMatchObject({
      audioStatus: 'ready_to_sync',
      pronunciationRequests: [googleRequest, kokoroRequest],
    });
  });

  it('keeps both-provider failure visible and retryable after restart', async () => {
    const storage = createMemoryStorage();
    const queue = new AnkiQueue(storage, { createId: () => 'q-fail' });
    const store = createMemoryPronunciationArtifactStore();
    await enqueueCardWithRequiredAudio(queue, {
      note,
      pronunciationRequests: [googleRequest, kokoroRequest],
    });

    await fulfillQueuedPronunciation(
      queue,
      dependencies({
        artifactStore: store,
        synthesize: async () => {
          throw new TtsError('generation_failed', 'provider failed');
        },
      }),
    );
    expect((await queue.list())[0]).toMatchObject({
      audioStatus: 'audio_failed',
      lastError: 'provider failed',
    });

    const restartedQueue = new AnkiQueue(storage);
    await fulfillQueuedPronunciation(
      restartedQueue,
      dependencies({ artifactStore: store }),
    );
    expect((await restartedQueue.list())[0]?.audioStatus).toBe('ready_to_sync');
  });

  it('continues to fulfill legacy queue entries with one pronunciation request', async () => {
    const storage = createMemoryStorage();
    const queue = new AnkiQueue(storage, { createId: () => 'legacy-audio' });
    await queue.enqueue(note, { pronunciationRequest: kokoroRequest });

    await fulfillQueuedPronunciation(queue, dependencies());

    expect((await queue.list())[0]).toMatchObject({ audioStatus: 'ready_to_sync' });
  });

  it('pins a chosen artifact before queue sync and releases it only after confirmed sync', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'pinned-artifact' });
    const store = createMemoryPronunciationArtifactStore();
    const prepared = await runPronunciationWorkflow(
      input({ purpose: 'anki' }),
      dependencies({ artifactStore: store }),
    );

    await enqueueCardWithRequiredAudio(
      queue,
      {
        note,
        pronunciationRequests: prepared.pronunciationRequests,
        artifactKey: prepared.artifactKey,
      },
      store,
    );
    expect((await store.get(prepared.artifactKey!))?.pinned).toBe(true);

    await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn().mockResolvedValue([]),
      addNote: vi.fn().mockResolvedValue(101),
      artifactStore: store,
      audioFieldsForNote: () => ['Reading'],
    });

    expect((await queue.list()).length).toBe(0);
    expect((await store.get(prepared.artifactKey!))?.pinned).toBe(false);
  });

  it.each(['google', 'bergamot'] as TranslationProvider[])(
    'never syncs a post-feature %s card without required encoded audio',
    async () => {
      const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'required-audio' });
      await enqueueCardWithRequiredAudio(queue, {
        note,
        pronunciationRequests: [googleRequest],
      });
      const addNote = vi.fn();
      await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
        findNoteIds: vi.fn(),
        addNote,
      });
      expect(addNote).not.toHaveBeenCalled();
    },
  );
});
