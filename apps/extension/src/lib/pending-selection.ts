import type { PendingSelection } from './context-selection';

const PENDING_SELECTION_KEY = 'pendingSelection';

export async function savePendingSelection(selection: PendingSelection): Promise<void> {
  await chrome.storage.session.set({ [PENDING_SELECTION_KEY]: selection });
}

export async function takePendingSelection(): Promise<PendingSelection | null> {
  const stored = await chrome.storage.session.get(PENDING_SELECTION_KEY);
  await chrome.storage.session.remove(PENDING_SELECTION_KEY);
  return (stored[PENDING_SELECTION_KEY] as PendingSelection | undefined) ?? null;
}
