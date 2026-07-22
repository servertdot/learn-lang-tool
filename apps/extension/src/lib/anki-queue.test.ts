import { describe, expect, it, vi } from 'vitest';
import { createAnkiNote, DEFAULT_ANKI_SETTINGS } from './anki';
import { AnkiQueue, getAnkiQueueTag, type AnkiQueueStorage } from './anki-queue';
import { syncAnkiQueue } from './anki-queue-sync';

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

describe('AnkiQueue', () => {
  it('stores a note with a stable tag for idempotent sync', async () => {
    const queue = new AnkiQueue(createMemoryStorage(), {
      createId: () => 'queue-id-1',
      now: () => 123,
    });

    const item = await queue.enqueue(note);

    expect(item).toMatchObject({ id: 'queue-id-1', createdAt: 123 });
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
});
