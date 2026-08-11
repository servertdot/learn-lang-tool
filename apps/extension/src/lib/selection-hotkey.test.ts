// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { registerSelectionHotkey } from './selection-hotkey';

describe('registerSelectionHotkey', () => {
  it('translates selected text from an extension-owned PDF viewer', async () => {
    const translateSelection = vi.fn(async () => undefined);
    const unregister = await registerSelectionHotkey(window, {
      getHotkey: async () => 'Alt',
      readSelection: () => ({
        text: 'selected PDF text',
        pageUrl: 'https://example.com/document.pdf',
      }),
      translateSelection,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));

    expect(translateSelection).toHaveBeenCalledWith({
      text: 'selected PDF text',
      pageUrl: 'https://example.com/document.pdf',
    });
    unregister();
  });

  it('does nothing when the PDF viewer has no selection', async () => {
    const translateSelection = vi.fn(async () => undefined);
    const unregister = await registerSelectionHotkey(window, {
      getHotkey: async () => 'Alt',
      readSelection: () => null,
      translateSelection,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));

    expect(translateSelection).not.toHaveBeenCalled();
    unregister();
  });
});
