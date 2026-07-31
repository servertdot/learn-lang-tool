import type { AnkiCardContent } from './anki';
import type { AnkiExportFormat } from './anki-export';
import type { AnkiQueueInfo } from './anki-queue';
import type {
  AnkiAddNoteResponse,
  AnkiCollectionInfoResponse,
  AnkiModelFieldNamesResponse,
  AnkiQueueClearResponse,
  AnkiQueueExportResponse,
  AnkiQueueInfoResponse,
  AnkiQueueSyncResponse,
  AnkiViewNoteResponse,
  AnkiDuplicateDecision,
  LltMessage,
} from './extension-messages';
import type { AnkiDuplicateConflict } from './anki-queue-sync';

export interface AnkiCollectionInfo {
  deckNames: string[];
  modelNames: string[];
}

export async function requestAnkiCollectionInfo(): Promise<AnkiCollectionInfo> {
  const message: LltMessage = { type: 'llt.anki.getCollectionInfo' };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiCollectionInfoResponse;
  if (!response.ok) throw new Error(response.error);
  return { deckNames: response.deckNames, modelNames: response.modelNames };
}

export async function requestAnkiModelFieldNames(modelName: string): Promise<string[]> {
  const message: LltMessage = { type: 'llt.anki.getModelFieldNames', modelName };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiModelFieldNamesResponse;
  if (!response.ok) throw new Error(response.error);
  return response.fieldNames;
}

export type AnkiAddResult =
  | { status: 'synced'; noteId: number; queuedCount: number }
  | { status: 'queued'; queuedCount: number };

export async function requestAddToAnki(content: AnkiCardContent): Promise<AnkiAddResult> {
  const message: LltMessage = {
    type: 'llt.anki.addNote',
    content,
  };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiAddNoteResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.status === 'synced'
    ? { status: 'synced', noteId: response.noteId, queuedCount: response.queuedCount }
    : { status: 'queued', queuedCount: response.queuedCount };
}

export async function requestViewInAnki(noteId: number): Promise<void> {
  const message: LltMessage = {
    type: 'llt.anki.viewNote',
    noteId,
  };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiViewNoteResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
}

export async function requestAnkiQueueInfo(): Promise<AnkiQueueInfo> {
  const message: LltMessage = { type: 'llt.anki.queue.getInfo' };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiQueueInfoResponse;
  if (!response.ok) throw new Error(response.error);
  return {
    count: response.count,
    failedCount: response.failedCount,
    lastError: response.lastError,
  };
}

export async function requestAnkiQueueSync(): Promise<
  AnkiQueueInfo & { syncedCount: number; duplicateConflicts: AnkiDuplicateConflict[] }
> {
  const message: LltMessage = { type: 'llt.anki.queue.sync' };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiQueueSyncResponse;
  if (!response.ok) throw new Error(response.error);
  return {
    syncedCount: response.syncedCount,
    count: response.count,
    failedCount: response.failedCount,
    lastError: response.lastError,
    duplicateConflicts: response.duplicateConflicts,
  };
}

export async function requestResolveAnkiDuplicates(
  decisions: AnkiDuplicateDecision[],
): Promise<
  AnkiQueueInfo & { syncedCount: number; duplicateConflicts: AnkiDuplicateConflict[] }
> {
  const message: LltMessage = { type: 'llt.anki.queue.resolveDuplicates', decisions };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiQueueSyncResponse;
  if (!response.ok) throw new Error(response.error);
  return {
    syncedCount: response.syncedCount,
    count: response.count,
    failedCount: response.failedCount,
    lastError: response.lastError,
    duplicateConflicts: response.duplicateConflicts,
  };
}

export async function requestAnkiQueueExport(format: AnkiExportFormat) {
  const message: LltMessage = { type: 'llt.anki.queue.export', format };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiQueueExportResponse;
  if (!response.ok) throw new Error(response.error);
  return {
    content: response.content,
    filename: response.filename,
    mimeType: response.mimeType,
  };
}

export async function requestAnkiQueueClear(): Promise<void> {
  const message: LltMessage = { type: 'llt.anki.queue.clear' };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiQueueClearResponse;
  if (!response.ok) throw new Error(response.error);
}
