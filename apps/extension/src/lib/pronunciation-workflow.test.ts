import { describe, expect, it, vi } from 'vitest';
import type { TranslateResponse } from '@package/shared';
import {
  TtsError,
  type AudioTtsProvider,
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
  preparePronunciationForResult,
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

const result: TranslateResponse = {
  source_text: 'hello',
  translated_text: 'привет',
  from_code: 'en',
  to_code: 'ru',
  can_add_to_anki: true,
};

function fakeArtifact(request: PronunciationRequest): PronunciationArtifact {
  return {
    artifactKey: 'pending',
    filename: 'pending.mp3',
    bytes: new Uint8Array([9, 9, 9]),
    mimeType: 'audio/mpeg',
    extension: 'mp3',
    sampleRate: 24000,
    language: request.language,
    voiceId: request.voiceId,
    speed: request.speed,
  };
}

function createFakeProvider(
  synthesizeImpl?: AudioTtsProvider['synthesize'],
): AudioTtsProvider {
  return {
    id: 'kokoro',
    revision: 'v1.0',
    supportsLanguage: language => language === 'en',
    requiredModelPackIds: () => ['kokoro-en-v1.0'],
    synthesize:
      synthesizeImpl ??
      (async (request, signal) => {
        if (signal?.aborted) {
          throw new TtsError('request_cancelled', 'cancelled');
        }
        return fakeArtifact(request);
      }),
  };
}

describe('preparePronunciationForResult', () => {
  it('reports pack_missing without downloading when the speech pack is not ready', async () => {
    const synthesize = vi.fn();
    const state = await preparePronunciationForResult(result, 'req-1', {
      ttsProvider: createFakeProvider(synthesize),
      artifactStore: createMemoryPronunciationArtifactStore(),
      getSpeechPackStatus: async () => 'missing',
    });

    expect(state.uiState).toBe('pack_missing');
    expect(state.speechModelPackId).toBe('kokoro-en-v1.0');
    expect(state.approxSizeBytes).toBeGreaterThan(1_000_000);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('prepares audio after the speech pack is ready', async () => {
    const store = createMemoryPronunciationArtifactStore();
    const state = await preparePronunciationForResult(result, 'req-2', {
      ttsProvider: createFakeProvider(),
      artifactStore: store,
      getSpeechPackStatus: async () => 'ready',
    });

    expect(state.uiState).toBe('ready');
    expect(state.artifactKey).toMatch(/^pron:/);
    expect(await store.get(state.artifactKey!)).not.toBeNull();
  });

  it('reuses a cached artifact for an identical request', async () => {
    const store = createMemoryPronunciationArtifactStore();
    const synthesize = vi.fn(async (request: PronunciationRequest) => fakeArtifact(request));
    const deps = {
      ttsProvider: createFakeProvider(synthesize),
      artifactStore: store,
      getSpeechPackStatus: async () => 'ready' as const,
    };

    const first = await preparePronunciationForResult(result, 'req-a', deps);
    const second = await preparePronunciationForResult(result, 'req-b', deps);

    expect(first.artifactKey).toBe(second.artifactKey);
    expect(synthesize).toHaveBeenCalledOnce();
  });

  it('returns unsupported for languages without an enabled provider', async () => {
    const state = await preparePronunciationForResult(
      { ...result, from_code: 'ru', source_text: 'привет' },
      'req-ru',
      {
        ttsProvider: createFakeProvider(),
        artifactStore: createMemoryPronunciationArtifactStore(),
        getSpeechPackStatus: async () => 'ready',
      },
    );

    expect(state.uiState).toBe('unsupported');
    expect(state.errorCode).toBe('language_unsupported');
  });

  it('surfaces generation failure without hiding the translation result', async () => {
    const state = await preparePronunciationForResult(result, 'req-fail', {
      ttsProvider: createFakeProvider(async () => {
        throw new TtsError('generation_failed', 'Kokoro crashed');
      }),
      artifactStore: createMemoryPronunciationArtifactStore(),
      getSpeechPackStatus: async () => 'ready',
    });

    expect(state).toMatchObject({
      uiState: 'failed',
      errorCode: 'generation_failed',
      errorMessage: 'Kokoro crashed',
    });
  });
});

describe('queue-first pronunciation and Anki sync', () => {
  it('lets the learner queue a card while audio is still preparing', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'q1' });
    const store = createMemoryPronunciationArtifactStore();
    const note = createAnkiNote(DEFAULT_ANKI_SETTINGS, {
      textFrom: 'hello',
      textTo: 'привет',
      sentence: 'hello',
    });
    const request = {
      text: 'hello',
      language: 'en',
      providerId: 'kokoro',
      providerRevision: 'v1.0',
      voiceId: 'af_heart',
      speed: 1,
      encodingVersion: 2,
    };

    const enqueued = await enqueueCardWithRequiredAudio(queue, {
      note,
      pronunciationRequest: request,
    });
    expect(enqueued.audioStatus).toBe('waiting_for_audio');

    const addNote = vi.fn();
    const blocked = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn(),
      addNote,
      artifactStore: store,
      audioFieldsForNote: () => ['Reading'],
    });
    expect(addNote).not.toHaveBeenCalled();
    expect(blocked.error).toMatch(/Waiting for pronunciation/);

    await fulfillQueuedPronunciation(queue, {
      ttsProvider: createFakeProvider(),
      artifactStore: store,
      getSpeechPackStatus: async () => 'ready',
    });

    const synced = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn().mockResolvedValue([]),
      addNote: vi.fn().mockResolvedValue(101),
      artifactStore: store,
      audioFieldsForNote: () => ['Reading'],
    });

    expect(synced.noteIds.q1).toBe(101);
    expect((await queue.getInfo()).count).toBe(0);
  });

  it('keeps failed audio generation visible and retryable on the queue', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'q-fail' });
    const store = createMemoryPronunciationArtifactStore();
    const note = createAnkiNote(DEFAULT_ANKI_SETTINGS, {
      textFrom: 'hello',
      textTo: 'привет',
      sentence: 'hello',
    });
    const pronunciationRequest = {
      text: 'hello',
      language: 'en',
      providerId: 'kokoro',
      providerRevision: 'v1.0',
      voiceId: 'af_heart',
      speed: 1,
      encodingVersion: 2,
    };

    await enqueueCardWithRequiredAudio(queue, { note, pronunciationRequest });

    await fulfillQueuedPronunciation(queue, {
      ttsProvider: createFakeProvider(async () => {
        throw new TtsError('generation_failed', 'encode failed');
      }),
      artifactStore: store,
      getSpeechPackStatus: async () => 'ready',
    });

    expect((await queue.list())[0]).toMatchObject({
      audioStatus: 'audio_failed',
      lastError: 'encode failed',
    });

    await fulfillQueuedPronunciation(queue, {
      ttsProvider: createFakeProvider(),
      artifactStore: store,
      getSpeechPackStatus: async () => 'ready',
    });

    expect((await queue.list())[0]?.audioStatus).toBe('ready_to_sync');
  });
});
