import { describe, expect, it, vi } from 'vitest';
import { createAnkiNote, DEFAULT_ANKI_SETTINGS } from './anki';
import {
  AnkiQueue,
  getAnkiQueueTag,
  type AnkiQueueStorage,
} from './anki-queue';
import { syncAnkiQueue } from './anki-queue-sync';
import { createMemoryPronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  PRONUNCIATION_ENCODING_VERSION,
  type PronunciationRequest,
} from './audio-tts-provider';

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

const note = createAnkiNote(DEFAULT_ANKI_SETTINGS, {
  textFrom: 'take it easy',
  textTo: 'не торопись',
  sentence: 'Take it easy today.',
});

const pronunciationRequest: PronunciationRequest = {
  text: 'take it easy',
  language: 'en',
  providerId: 'kokoro',
  providerRevision: 'v1.0',
  voiceId: 'af_heart',
  speed: 1,
  encodingVersion: PRONUNCIATION_ENCODING_VERSION,
};

describe('AnkiQueue', () => {
  it('stores a note with a stable tag for idempotent sync', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), {
      createId: () => 'queue-id-1',
      now: () => 123,
    });

    const item = await queue.enqueue(note);

    expect(item).toMatchObject({
      id: 'queue-id-1',
      createdAt: 123,
      audioStatus: 'legacy_text_only',
    });
    expect(item.note.tags).toContain(getAnkiQueueTag('queue-id-1'));
    expect((await queue.getInfo()).count).toBe(1);
  });

  it('keeps a card queued when Anki is unavailable', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'offline' });
    await queue.enqueue(note);

    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn().mockRejectedValue(new Error('Anki is closed')),
      addNote: vi.fn(),
    });

    expect(result).toMatchObject({ syncedCount: 0, error: 'Anki is closed' });
    expect(await queue.getInfo()).toMatchObject({
      count: 1,
      failedCount: 1,
      lastError: 'Anki is closed',
    });
  });

  it('removes a card after it is added to Anki', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'pending' });
    await queue.enqueue(note);

    const removeQueueTag = vi.fn().mockResolvedValue(undefined);
    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn().mockResolvedValue([]),
      addNote: vi.fn().mockResolvedValue(42),
      removeQueueTag,
    });

    expect(result.noteIds.pending).toBe(42);
    expect((await queue.getInfo()).count).toBe(0);
    expect(removeQueueTag).toHaveBeenCalledWith(DEFAULT_ANKI_SETTINGS, 42, 'pending');
  });

  it('recognizes a note created before a response was lost', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'ambiguous' });
    await queue.enqueue(note);
    const findNoteIds = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([77]);

    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds,
      addNote: vi.fn().mockRejectedValue(new Error('Response timed out')),
    });

    expect(result.noteIds.ambiguous).toBe(77);
    expect((await queue.getInfo()).count).toBe(0);
  });

  it('migrates legacy queue entries as text-only without discarding them', async () => {
    const storage = createMemoryStorage();
    storage.value = [
      {
        id: 'legacy',
        createdAt: 1,
        note,
      },
    ];
    const queue = new AnkiQueue(storage);
    const items = await queue.list();
    expect(items[0]?.audioStatus).toBe('legacy_text_only');
  });

  it('never creates an Anki note while audio is still preparing', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'audio-pending' });
    await queue.enqueue(note, {
      pronunciationRequest,
      audioStatus: 'waiting_for_audio',
    });
    const addNote = vi.fn();

    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn(),
      addNote,
    });

    expect(addNote).not.toHaveBeenCalled();
    expect(result.error).toMatch(/Waiting for pronunciation/);
    expect((await queue.getInfo()).count).toBe(1);
  });

  it('never falls back to a text-only note after audio generation failure', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'audio-failed' });
    await queue.enqueue(note, {
      pronunciationRequest,
      audioStatus: 'waiting_for_audio',
    });
    await queue.setAudioFailed('audio-failed', 'generation failed');
    const addNote = vi.fn();

    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn(),
      addNote,
    });

    expect(addNote).not.toHaveBeenCalled();
    expect(result.error).toBe('generation failed');
  });

  it('syncs an audio-ready card with deterministic media from the artifact store', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), { createId: () => 'audio-ready' });
    const store = createMemoryPronunciationArtifactStore();
    await store.put(
      {
        artifactKey: 'pron:abc',
        filename: 'llt_abc.wav',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        extension: 'wav',
        sampleRate: 24000,
        language: 'en',
        voiceId: 'af_heart',
        speed: 1,
      },
      { pinned: true },
    );
    await queue.enqueue(note, {
      pronunciationRequest,
      artifactKey: 'pron:abc',
      audioStatus: 'ready_to_sync',
    });

    const addNote = vi.fn().mockResolvedValue(55);
    const result = await syncAnkiQueue(queue, DEFAULT_ANKI_SETTINGS, {
      findNoteIds: vi.fn().mockResolvedValue([]),
      addNote,
      artifactStore: store,
      audioFieldsForNote: () => ['Reading'],
    });

    expect(result.noteIds['audio-ready']).toBe(55);
    expect(addNote).toHaveBeenCalledWith(
      DEFAULT_ANKI_SETTINGS,
      expect.objectContaining({ deckName: 'English' }),
      {
        filename: 'llt_abc.wav',
        data: btoa(String.fromCharCode(1, 2, 3)),
        fields: ['Reading'],
      },
    );
    expect((await store.get('pron:abc'))?.pinned).toBe(false);
  });
});
