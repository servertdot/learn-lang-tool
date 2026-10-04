import type { PendingSelection } from './context-selection';
import { takePendingSelection } from './pending-selection';
import type { LltMessage } from './extension-messages';

interface ActiveTab {
  id?: number;
  url?: string;
}

interface ActiveTabSelectionDependencies {
  queryActiveTab(): Promise<ActiveTab | undefined>;
  requestSelection(tabId: number): Promise<unknown>;
}

interface SelectionMessagingDependencies {
  requestContentSelection(tabId: number): Promise<unknown>;
  requestExtensionSelection(tabId: number): Promise<unknown>;
}

interface PopupSelectionDependencies {
  takePendingSelection(): Promise<PendingSelection | null>;
  readActiveTabSelection(): Promise<PendingSelection | null>;
}

export interface PopupSelection extends PendingSelection {
  trigger: 'toolbar' | 'selection-action';
}

function asPendingSelection(response: unknown, fallbackPageUrl?: string): PendingSelection | null {
  if (!response || typeof response !== 'object') return null;

  const candidate = response as { text?: unknown; pageUrl?: unknown };
  if (typeof candidate.text !== 'string') return null;

  const text = candidate.text.trim();
  if (!text) return null;

  const responsePageUrl =
    typeof candidate.pageUrl === 'string' && candidate.pageUrl ? candidate.pageUrl : undefined;

  return {
    text,
    pageUrl: responsePageUrl ?? fallbackPageUrl,
  };
}

export async function requestSelectionFromTab(
  tabId: number,
  dependencies: SelectionMessagingDependencies = {
    requestContentSelection: id =>
      chrome.tabs.sendMessage(id, { type: 'llt.pageSelection.get' } satisfies LltMessage),
    requestExtensionSelection: id =>
      chrome.runtime.sendMessage({
        type: 'llt.pageSelection.get',
        tabId: id,
      } satisfies LltMessage),
  },
): Promise<unknown> {
  try {
    const response = await dependencies.requestContentSelection(tabId);
    if (response) return response;
  } catch {
    // Extension-owned pages, such as our PDF viewer, do not host content scripts.
  }

  try {
    return await dependencies.requestExtensionSelection(tabId);
  } catch {
    return null;
  }
}

export async function readActiveTabSelection(
  dependencies: ActiveTabSelectionDependencies = {
    queryActiveTab: async () =>
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
    requestSelection: requestSelectionFromTab,
  },
): Promise<PendingSelection | null> {
  try {
    const tab = await dependencies.queryActiveTab();
    if (tab?.id === undefined) return null;

    const response = await dependencies.requestSelection(tab.id);
    return asPendingSelection(response, tab.url);
  } catch {
    // Restricted pages and built-in viewers may not host our content script.
    return null;
  }
}

export async function getPopupSelection(
  dependencies: PopupSelectionDependencies = {
    takePendingSelection,
    readActiveTabSelection,
  },
): Promise<PopupSelection | null> {
  const pendingSelection = await dependencies.takePendingSelection();
  if (pendingSelection) return { ...pendingSelection, trigger: 'selection-action' };

  const selection = await dependencies.readActiveTabSelection();
  return selection ? { ...selection, trigger: 'toolbar' } : null;
}
