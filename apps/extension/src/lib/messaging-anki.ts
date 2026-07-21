import type { AnkiCardContent } from './anki';
import type {
  AnkiAddNoteResponse,
  AnkiViewNoteResponse,
  LltMessage,
} from './extension-messages';

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
