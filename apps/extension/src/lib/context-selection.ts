export const TRANSLATE_SELECTION_MENU_ID = 'llt.translate-selection';

export interface PendingSelection {
  text: string;
  pageUrl?: string;
}

interface ContextSelectionInfo {
  menuItemId: string | number;
  selectionText?: string;
  pageUrl?: string;
}

interface ContextSelectionTab {
  windowId?: number;
}

interface ContextSelectionDependencies {
  saveSelection(selection: PendingSelection): Promise<void>;
  openPopup(windowId?: number): Promise<void>;
}

interface SelectionResultDependencies {
  openActionPopup(windowId?: number): Promise<void>;
  openWindow(): Promise<void>;
}

export async function openSelectionResult(
  windowId: number | undefined,
  dependencies: SelectionResultDependencies,
): Promise<void> {
  try {
    await dependencies.openActionPopup(windowId);
  } catch {
    await dependencies.openWindow();
  }
}

export async function handleContextSelection(
  info: ContextSelectionInfo,
  tab: ContextSelectionTab,
  dependencies: ContextSelectionDependencies,
): Promise<void> {
  if (info.menuItemId !== TRANSLATE_SELECTION_MENU_ID) return;

  const text = info.selectionText?.trim();
  if (!text) return;

  await dependencies.saveSelection({ text, pageUrl: info.pageUrl });
  await dependencies.openPopup(tab.windowId);
}
