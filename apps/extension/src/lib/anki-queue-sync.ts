import type { AnkiNote, AnkiSettings } from './anki';
import type { AnkiConnectAudioAttachment, AnkiExistingNote } from './anki-connect';
import type { AnkiQueue, AnkiQueueItem } from './anki-queue';
import type { PronunciationArtifactStore } from './pronunciation-artifact-store';
import { bytesToBase64 } from './pronunciation-artifact-store';

export interface AnkiQueueSyncDependencies {
  findNoteIds(settings: AnkiSettings, queueItemId: string): Promise<number[]>;
  addNote(
    settings: AnkiSettings,
    note: AnkiNote,
    audio?: AnkiConnectAudioAttachment,
  ): Promise<number>;
  removeQueueTag?(
    settings: AnkiSettings,
    noteId: number,
    queueItemId: string,
  ): Promise<void>;
  artifactStore?: PronunciationArtifactStore;
  audioFieldsForNote?(settings: AnkiSettings, item: AnkiQueueItem): string[];
  isDuplicateError?(error: unknown): boolean;
  findDuplicateNotes?(
    settings: AnkiSettings,
    note: AnkiNote,
  ): Promise<AnkiExistingNote[]>;
}

export interface AnkiDuplicateConflict {
  queueItemId: string;
  pendingNote: AnkiNote;
  existingNotes: AnkiExistingNote[];
}

export interface AnkiQueueSyncResult {
  syncedCount: number;
  noteIds: Record<string, number>;
  duplicateConflicts: AnkiDuplicateConflict[];
  error?: string;
}

function itemNeedsAudio(item: AnkiQueueItem): boolean {
  return (
    item.audioStatus === 'waiting_for_audio' ||
    item.audioStatus === 'ready_to_sync' ||
    item.audioStatus === 'sync_failed' ||
    item.audioStatus === 'audio_failed'
  );
}

export async function syncAnkiQueue(
  queue: AnkiQueue,
  settings: AnkiSettings,
  dependencies: AnkiQueueSyncDependencies,
): Promise<AnkiQueueSyncResult> {
  const noteIds: Record<string, number> = {};
  const duplicateConflicts: AnkiDuplicateConflict[] = [];
  let deferredError: string | undefined;
  const items = await queue.list();

  for (const item of items) {
    if (item.audioStatus === 'waiting_for_audio') {
      deferredError ??= 'Waiting for pronunciation audio before syncing to Anki.';
      continue;
    }

    if (item.audioStatus === 'audio_failed') {
      deferredError ??= item.lastError ?? 'Pronunciation audio generation failed.';
      continue;
    }

    try {
      let existing = await dependencies.findNoteIds(settings, item.id);
      let noteId = existing[0];

      if (noteId === undefined) {
        let audio: AnkiConnectAudioAttachment | undefined;
        if (itemNeedsAudio(item) && item.artifactKey) {
          const store = dependencies.artifactStore;
          if (!store) {
            throw new Error('Pronunciation artifact store is not available.');
          }
          const artifact = await store.get(item.artifactKey);
          if (!artifact) {
            throw new Error('Pronunciation artifact is missing from local storage.');
          }
          const fields =
            dependencies.audioFieldsForNote?.(settings, item) ??
            Object.keys(item.note.fields).slice(0, 0);
          if (fields.length === 0) {
            throw new Error('No Anki field is mapped for audio.');
          }
          audio = {
            filename: artifact.filename,
            data: bytesToBase64(artifact.bytes),
            fields,
          };
        }

        try {
          noteId = await dependencies.addNote(settings, item.note, audio);
        } catch (addError) {
          // A network response can be lost after Anki created the note. Looking
          // up the queue tag before retrying prevents duplicate cards.
          existing = await dependencies.findNoteIds(settings, item.id);
          if (existing[0] === undefined) throw addError;
          noteId = existing[0];
        }
      }

      noteIds[item.id] = noteId;
      const artifactKey = item.artifactKey;
      await queue.remove(item.id);
      if (artifactKey && dependencies.artifactStore) {
        await dependencies.artifactStore.unpin(artifactKey);
      }
      try {
        await dependencies.removeQueueTag?.(settings, noteId, item.id);
      } catch {
        // The private tag is only for retry safety. Failing to clean it up must
        // not put an already-synced card back into the local queue.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync the Anki queue.';
      await queue.setError(item.id, message);
      if (dependencies.isDuplicateError?.(error)) {
        let existingNotes: AnkiExistingNote[] = [];
        try {
          existingNotes = (await dependencies.findDuplicateNotes?.(settings, item.note)) ?? [];
        } catch {
          // The conflict can still be resolved by the user even if its Anki
          // details could not be loaded.
        }
        duplicateConflicts.push({
          queueItemId: item.id,
          pendingNote: item.note,
          existingNotes,
        });
        continue;
      }
      return {
        syncedCount: Object.keys(noteIds).length,
        noteIds,
        duplicateConflicts,
        error: message,
      };
    }
  }

  return {
    syncedCount: Object.keys(noteIds).length,
    noteIds,
    duplicateConflicts,
    error: deferredError,
  };
}
