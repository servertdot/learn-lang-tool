import { describe, expect, it, vi } from 'vitest';
import {
  getPopupSelection,
  readActiveTabSelection,
  requestSelectionFromTab,
} from './popup-selection';

describe('requestSelectionFromTab', () => {
  it('keeps the ordinary content-script selection as the first choice', async () => {
    const requestExtensionSelection = vi.fn(async () => ({ text: 'PDF selection' }));

    const selection = await requestSelectionFromTab(17, {
      requestContentSelection: async () => ({ text: 'page selection' }),
      requestExtensionSelection,
    });

    expect(selection).toEqual({ text: 'page selection' });
    expect(requestExtensionSelection).not.toHaveBeenCalled();
  });

  it('asks an extension-owned PDF viewer when no content script can respond', async () => {
    const selection = await requestSelectionFromTab(17, {
      requestContentSelection: async () => {
        throw new Error('Receiving end does not exist');
      },
      requestExtensionSelection: async tabId => ({
        text: 'PDF selection',
        pageUrl: `file:///document-${tabId}.pdf`,
      }),
    });

    expect(selection).toEqual({
      text: 'PDF selection',
      pageUrl: 'file:///document-17.pdf',
    });
  });
});

describe('readActiveTabSelection', () => {
  it('reads and trims the selection from the active tab', async () => {
    const queryActiveTab = vi.fn(async () => ({
      id: 17,
      url: 'https://example.com/article',
    }));
    const requestSelection = vi.fn(async () => ({ text: '  selected text  ' }));

    const selection = await readActiveTabSelection({ queryActiveTab, requestSelection });

    expect(requestSelection).toHaveBeenCalledWith(17);
    expect(selection).toEqual({
      text: 'selected text',
      pageUrl: 'https://example.com/article',
    });
  });

  it('keeps the selected frame URL when one is returned', async () => {
    const selection = await readActiveTabSelection({
      queryActiveTab: async () => ({ id: 17, url: 'https://example.com/article' }),
      requestSelection: async () => ({
        text: 'frame selection',
        pageUrl: 'https://embedded.example/content',
      }),
    });

    expect(selection?.pageUrl).toBe('https://embedded.example/content');
  });

  it('returns no selection when the active page cannot receive extension messages', async () => {
    const selection = await readActiveTabSelection({
      queryActiveTab: async () => ({ id: 17 }),
      requestSelection: async () => {
        throw new Error('Receiving end does not exist');
      },
    });

    expect(selection).toBeNull();
  });
});

describe('getPopupSelection', () => {
  it('keeps the context-menu selection ahead of a live page selection', async () => {
    const readActiveTabSelection = vi.fn(async () => ({ text: 'live selection' }));

    const selection = await getPopupSelection({
      takePendingSelection: async () => ({ text: 'context-menu selection' }),
      readActiveTabSelection,
    });

    expect(selection?.text).toBe('context-menu selection');
    expect(readActiveTabSelection).not.toHaveBeenCalled();
  });

  it('falls back to the live page selection when context-menu storage is empty', async () => {
    const selection = await getPopupSelection({
      takePendingSelection: async () => null,
      readActiveTabSelection: async () => ({ text: 'live selection' }),
    });

    expect(selection?.text).toBe('live selection');
  });
});
