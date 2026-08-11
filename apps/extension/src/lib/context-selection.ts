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

export interface SelectionTranslationDependencies {
  saveSelection(selection: PendingSelection): Promise<void>;
  openPopup(windowId?: number): Promise<void>;
}

type ContextSelectionDependencies = SelectionTranslationDependencies;

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

  await showSelectionTranslation(
    { text: info.selectionText ?? '', pageUrl: info.pageUrl },
    tab.windowId,
    dependencies,
  );
}

export async function showSelectionTranslation(
  selection: PendingSelection,
  windowId: number | undefined,
  dependencies: SelectionTranslationDependencies,
): Promise<void> {
  const text = selection.text.trim();
  if (!text) return;

  await dependencies.saveSelection({ text, pageUrl: selection.pageUrl });
  await dependencies.openPopup(windowId);
}
