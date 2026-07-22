// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPageTextSource } from './page-text-source';

describe('readPageTextSource', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('keeps an ordinary DOM selection as the first choice', async () => {
    const text = document.createTextNode('A normal selected phrase');
    document.body.append(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.addRange(range);

    const source = await readPageTextSource({ window, document });

    expect(source?.text).toBe('A normal selected phrase');
    expect(source?.kind).toBe('selection');
    expect(source?.range).toBe(range);
  });

  it('reads the word under the pointer when there is no selection', async () => {
    document.body.innerHTML = '<p id="line" style="user-select: none">Hover over this word</p>';
    const line = document.getElementById('line')!;
    const text = line.firstChild as Text;
    const caret = document.createRange();
    caret.setStart(text, 17);
    caret.collapse(true);

    vi.spyOn(document, 'elementFromPoint').mockReturnValue(line);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caret),
    });

    const source = await readPageTextSource({
      window,
      document,
      pointer: { x: 120, y: 40 },
    });

    expect(source?.text).toBe('word');
    expect(source?.kind).toBe('hovered-word');
    expect(source?.range?.toString()).toBe('word');
  });

  it('keeps an explicit selection ahead of the hovered word', async () => {
    document.body.innerHTML = '<p id="line">selected hover</p>';
    const line = document.getElementById('line')!;
    const text = line.firstChild as Text;
    const selectionRange = document.createRange();
    selectionRange.setStart(text, 0);
    selectionRange.setEnd(text, 8);
    window.getSelection()?.addRange(selectionRange);

    const caretAtHover = document.createRange();
    caretAtHover.setStart(text, 10);
    caretAtHover.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretAtHover),
    });

    const source = await readPageTextSource({
      window,
      document,
      pointer: { x: 120, y: 40 },
    });

    expect(source?.text).toBe('selected');
    expect(source?.kind).toBe('selection');
  });

  it('reads the current YouTube caption when it cannot be selected', async () => {
    document.body.innerHTML = `
      <div class="ytp-caption-window-container">
        <span class="ytp-caption-segment">This text </span>
        <span class="ytp-caption-segment">cannot be selected</span>
      </div>
    `;

    const source = await readPageTextSource({
      window,
      document,
      pageUrl: new URL('https://www.youtube.com/watch?v=example'),
    });

    expect(source).toMatchObject({
      text: 'This text cannot be selected',
      kind: 'youtube-caption',
      range: null,
    });
  });

  it('uses copy-and-restore for a Google Docs canvas selection', async () => {
    let clipboard = 'keep my clipboard';
    const clipboardPort = {
      readText: vi.fn(async () => clipboard),
      writeText: vi.fn(async (text: string) => {
        clipboard = text;
      }),
    };
    const copySelection = vi.fn(() => {
      clipboard = 'Selected canvas text';
      return true;
    });

    const source = await readPageTextSource({
      window,
      document,
      pageUrl: new URL('https://docs.google.com/document/d/example/edit'),
      clipboard: clipboardPort,
      copySelection,
    });

    expect(source).toMatchObject({
      text: 'Selected canvas text',
      kind: 'clipboard-selection',
      range: null,
    });
    expect(copySelection).toHaveBeenCalledOnce();
    expect(clipboardPort.writeText).toHaveBeenCalledWith('keep my clipboard');
    expect(clipboard).toBe('keep my clipboard');
  });

  it('does not translate stale clipboard contents when copying fails', async () => {
    let clipboard = 'unrelated old clipboard text';
    const source = await readPageTextSource({
      window,
      document,
      pageUrl: new URL('https://docs.google.com/document/d/example/edit'),
      clipboard: {
        readText: vi.fn(async () => clipboard),
        writeText: vi.fn(async text => {
          clipboard = text;
        }),
      },
      copySelection: () => true,
    });

    expect(source).toBeNull();
    expect(clipboard).toBe('unrelated old clipboard text');
  });
});
