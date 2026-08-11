import { describe, expect, it, vi } from 'vitest';
import {
  TRANSLATE_SELECTION_MENU_ID,
  handleContextSelection,
  openSelectionResult,
  showSelectionTranslation,
} from './context-selection';

describe('handleContextSelection', () => {
  it('passes a PDF viewer selection to the extension popup', async () => {
    const saveSelection = vi.fn(async () => undefined);
    const openPopup = vi.fn(async () => undefined);

    await handleContextSelection(
      {
        menuItemId: TRANSLATE_SELECTION_MENU_ID,
        selectionText: '  selected PDF text  ',
        pageUrl: 'https://example.com/file.pdf',
      },
      { windowId: 42 },
      { saveSelection, openPopup },
    );

    expect(saveSelection).toHaveBeenCalledWith({
      text: 'selected PDF text',
      pageUrl: 'https://example.com/file.pdf',
    });
    expect(openPopup).toHaveBeenCalledWith(42);
  });

  it('ignores unrelated menu items and empty selections', async () => {
    const saveSelection = vi.fn(async () => undefined);
    const openPopup = vi.fn(async () => undefined);

    await handleContextSelection(
      { menuItemId: 'something-else', selectionText: 'text' },
      { windowId: 1 },
      { saveSelection, openPopup },
    );
    await handleContextSelection(
      { menuItemId: TRANSLATE_SELECTION_MENU_ID, selectionText: '   ' },
      { windowId: 1 },
      { saveSelection, openPopup },
    );

    expect(saveSelection).not.toHaveBeenCalled();
    expect(openPopup).not.toHaveBeenCalled();
  });

  it('opens a real extension window when action popup opening is unavailable', async () => {
    const openActionPopup = vi.fn(async () => {
      throw new Error('openPopup is unavailable');
    });
    const openWindow = vi.fn(async () => undefined);

    await openSelectionResult(42, { openActionPopup, openWindow });

    expect(openActionPopup).toHaveBeenCalledWith(42);
    expect(openWindow).toHaveBeenCalledOnce();
  });

  it('opens a selected PDF translation requested by the viewer hotkey', async () => {
    const saveSelection = vi.fn(async () => undefined);
    const openPopup = vi.fn(async () => undefined);

    await showSelectionTranslation(
      {
        text: '  selected PDF text  ',
        pageUrl: 'https://example.com/file.pdf',
      },
      42,
      { saveSelection, openPopup },
    );

    expect(saveSelection).toHaveBeenCalledWith({
      text: 'selected PDF text',
      pageUrl: 'https://example.com/file.pdf',
    });
    expect(openPopup).toHaveBeenCalledWith(42);
  });
});
