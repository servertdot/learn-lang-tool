import type { AnkiNote, AnkiSettings } from './anki';
import type { AnkiQueue } from './anki-queue';

export interface AnkiQueueSyncDependencies {
  findNoteIds(settings: AnkiSettings, queueItemId: string): Promise<number[]>;
  addNote(settings: AnkiSettings, note: AnkiNote): Promise<number>;
  removeQueueTag?(
    settings: AnkiSettings,
    noteId: number,
    queueItemId: string,
  ): Promise<void>;
}

export interface AnkiQueueSyncResult {
  syncedCount: number;
  noteIds: Record<string, number>;
  error?: string;
}

export async function syncAnkiQueue(
  queue: AnkiQueue,
  settings: AnkiSettings,
  dependencies: AnkiQueueSyncDependencies,
): Promise<AnkiQueueSyncResult> {
  const noteIds: Record<string, number> = {};

  while (true) {
    const item = (await queue.list())[0];
    if (!item) return { syncedCount: Object.keys(noteIds).length, noteIds };

    try {
      let existing = await dependencies.findNoteIds(settings, item.id);
      let noteId = existing[0];

      if (noteId === undefined) {
        try {
          noteId = await dependencies.addNote(settings, item.note);
        } catch (addError) {
          // A network response can be lost after Anki created the note. Looking
          // up the queue tag before retrying prevents duplicate cards.
          existing = await dependencies.findNoteIds(settings, item.id);
          if (existing[0] === undefined) throw addError;
          noteId = existing[0];
        }
      }

      noteIds[item.id] = noteId;
      await queue.remove(item.id);
      try {
        await dependencies.removeQueueTag?.(settings, noteId, item.id);
      } catch {
        // The private tag is only for retry safety. Failing to clean it up must
        // not put an already-synced card back into the local queue.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync the Anki queue.';
      await queue.setError(item.id, message);
      return { syncedCount: Object.keys(noteIds).length, noteIds, error: message };
    }
  }
}
