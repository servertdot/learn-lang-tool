import type { AnkiCardContent } from './anki';
import type {
  AnkiAddNoteResponse,
  AnkiCollectionInfoResponse,
  AnkiModelFieldNamesResponse,
  AnkiViewNoteResponse,
  LltMessage,
} from './extension-messages';

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

export async function requestAddToAnki(content: AnkiCardContent): Promise<number> {
  const message: LltMessage = {
    type: 'llt.anki.addNote',
    content,
  };
  const response = (await chrome.runtime.sendMessage(message)) as AnkiAddNoteResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.noteId;
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
