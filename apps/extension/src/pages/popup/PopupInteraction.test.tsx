// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Popup from './Popup';

const mocks = vi.hoisted(() => ({
  selection: vi.fn(),
  pair: vi.fn(),
  translate: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@src/lib/popup-selection', () => ({ getPopupSelection: mocks.selection }));
vi.mock('@src/lib/storage', () => ({
  getLanguagePair: mocks.pair,
  getTranslationProvider: vi.fn(async () => 'google'),
}));
vi.mock('@src/lib/product-translator', () => ({
  createProductTranslationFacade: () => ({ translate: mocks.translate }),
}));
vi.mock('@src/lib/messaging-anki', () => ({ requestViewInAnki: vi.fn() }));
vi.mock('@src/lib/messaging-pronunciation', () => ({
  requestAddToAnkiWithPronunciation: vi.fn(),
  playPronunciationPreviewInBrowser: vi.fn(),
  requestPronunciationCancel: vi.fn(async () => undefined),
  requestPronunciationPrepare: mocks.prepare,
  requestPronunciationStop: vi.fn(async () => undefined),
  requestSpeechModelPackInstall: vi.fn(),
}));

const result = {
  source_text: 'hello', translated_text: 'привет', from_code: 'en', to_code: 'ru',
  can_add_to_anki: false,
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', {
    action: { setBadgeText: vi.fn(async () => undefined) },
    runtime: { openOptionsPage: vi.fn(async () => undefined) },
  });
  mocks.selection.mockResolvedValue(null);
  mocks.pair.mockResolvedValue({ from_code: 'en', to_code: 'ru' });
  mocks.translate.mockResolvedValue(result);
  mocks.prepare.mockResolvedValue({ ok: true, uiState: 'ready' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () => root.render(<Popup />));
}

function source() {
  return container.querySelector<HTMLTextAreaElement>('#translator-source')!;
}

function target() {
  return container.querySelector<HTMLTextAreaElement>('#translator-target')!;
}

function button(name: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    element => element.textContent === name || element.getAttribute('aria-label') === name,
  )!;
}

async function type(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(source(), text);
    source().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('toolbar popup modes', () => {
  it('shows the manual translator immediately while checking for a selection', async () => {
    let finish!: (value: null) => void;
    mocks.selection.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    expect(container.textContent).not.toContain('Translating…');
    expect(source()).not.toBeNull();
    expect(mocks.translate).not.toHaveBeenCalled();
    await act(async () => finish(null));
    expect(source()).not.toBeNull();
  });

  it('keeps manual input when checking for a selection finishes late', async () => {
    let finish!: (value: { text: string }) => void;
    mocks.selection.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    expect(source()).not.toBeNull();
    await type('my own text');
    await act(async () => finish({ text: 'page selection' }));
    expect(source().value).toBe('my own text');
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('keeps language changes when a toolbar selection arrives late', async () => {
    let finish!: (value: { text: string }) => void;
    mocks.selection.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    await act(async () => {
      const select = container.querySelectorAll('select')[1];
      select.value = 'fr';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => finish({ text: 'hello' }));
    expect(source().value).toBe('');
    expect(container.querySelectorAll('select')[1].value).toBe('fr');
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('opens a focused translator without sending a request when nothing is selected', async () => {
    await open();
    expect(source().value).toBe('');
    expect(target().readOnly).toBe(true);
    expect(document.activeElement).toBe(source());
    expect(button('Translate').disabled).toBe(true);
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('automatically translates a context-menu selection and retains the Anki action', async () => {
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'selection-action' });
    mocks.translate.mockResolvedValue({ ...result, can_add_to_anki: true });
    await open();
    expect(mocks.translate).toHaveBeenCalledWith(
      { text: 'hello', from_code: 'en', to_code: 'ru' }, expect.any(AbortSignal),
    );
    expect(container.textContent).toContain('привет');
    expect(container.querySelector('[aria-label="Add to Anki"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('fills Source and automatically translates the toolbar selection within the form', async () => {
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'toolbar' });
    await open();
    expect(source().value).toBe('hello');
    expect(target().value).toBe('привет');
    expect(container.textContent).not.toContain('Translating…');
    expect(container.textContent).not.toContain('Open translator');
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(mocks.translate).toHaveBeenCalledWith(
      { text: 'hello', from_code: 'en', to_code: 'ru' }, expect.any(AbortSignal),
    );
    await type('new text');
    await submit();
    expect(mocks.translate).toHaveBeenLastCalledWith(
      { text: 'new text', from_code: 'en', to_code: 'ru' }, expect.any(AbortSignal),
    );
    expect(target().value).toBe('привет');
  });

  it('uses saved languages and submits multiline text with the keyboard', async () => {
    mocks.pair.mockResolvedValue({ from_code: 'de', to_code: 'fr' });
    await open();
    await type('Guten Tag\nWie geht es?');
    await act(async () => {
      source().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    expect(mocks.translate).toHaveBeenCalledWith(
      { text: 'Guten Tag\nWie geht es?', from_code: 'de', to_code: 'fr' }, expect.any(AbortSignal),
    );
    expect(target().value).toBe('привет');
  });

  it('swaps languages and moves the translated text into the source field', async () => {
    await open();
    await type('hello');
    await submit();
    await act(async () => button('Swap languages').click());
    expect(source().value).toBe('привет');
    expect(target().value).toBe('');
    await submit();
    expect(mocks.translate).toHaveBeenLastCalledWith(
      { text: 'привет', from_code: 'ru', to_code: 'en' }, expect.any(AbortSignal),
    );
  });

  it('ignores an old translation that finishes after input changes', async () => {
    let finish!: (value: typeof result) => void;
    mocks.translate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    await type('hello');
    await submit();
    const signal = mocks.translate.mock.calls[0][1] as AbortSignal;
    await type('different text');
    expect(signal.aborted).toBe(true);
    await act(async () => finish(result));
    expect(target().value).toBe('');
    expect(button('Translate').disabled).toBe(false);
  });

  it('keeps source text on failure and lets the user retry', async () => {
    mocks.translate.mockRejectedValueOnce(new Error('Network unavailable'));
    await open();
    await type('hello');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network unavailable');
    expect(source().value).toBe('hello');
    await submit();
    expect(target().value).toBe('привет');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('blocks blank and oversized input without truncating a paste', async () => {
    await open();
    await type('   ');
    await submit();
    await type('a'.repeat(2001));
    await submit();
    expect(source().value.length).toBe(2001);
    expect(button('Translate').disabled).toBe(true);
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('cancels a selection request when switching to manual input', async () => {
    let finish!: (value: typeof result) => void;
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'selection-action' });
    mocks.translate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mocks.translate.mockImplementationOnce(() => new Promise(() => undefined));
    await open();
    const signal = mocks.translate.mock.calls[0][1] as AbortSignal;
    await act(async () => button('Open translator').click());
    await act(async () => finish(result));
    expect(signal.aborted).toBe(true);
    expect(source().value).toBe('hello');
    expect(target().value).toBe('');
    expect(mocks.translate).toHaveBeenCalledTimes(2);
  });

  it('copies the result and clears both fields for the next translation', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await open();
    await type('hello');
    await submit();
    await act(async () => button('Copy').click());
    expect(writeText).toHaveBeenCalledWith('привет');
    expect(button('Copied')).toBeDefined();
    await act(async () => button('Clear').click());
    expect(source().value).toBe('');
    expect(target().value).toBe('');
    expect(button('Copy').disabled).toBe(true);
    expect(document.activeElement).toBe(source());
  });

  it('keeps the translation available if clipboard access fails', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard denied'));
    await open();
    await type('hello');
    await submit();
    await act(async () => button('Copy').click());
    expect(target().value).toBe('привет');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('copy it manually');
  });

  it('clears a previous result when the target language changes', async () => {
    await open();
    await type('hello');
    await submit();
    await act(async () => {
      const select = container.querySelectorAll('select')[1];
      select.value = 'fr';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(target().value).toBe('');
    expect(source().value).toBe('hello');
    await submit();
    expect(mocks.translate).toHaveBeenLastCalledWith(
      { text: 'hello', from_code: 'en', to_code: 'fr' }, expect.any(AbortSignal),
    );
  });

  it('does not wait for badge cleanup to open the translator', async () => {
    let finish!: () => void;
    vi.mocked(chrome.action.setBadgeText).mockImplementationOnce(
      () => new Promise<void>(resolve => { finish = resolve; }),
    );
    await open();
    expect(source()).not.toBeNull();
    expect(container.textContent).not.toContain('Translating…');
    await act(async () => finish());
    expect(source()).not.toBeNull();
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('fills Source when a toolbar selection arrives late without switching modes', async () => {
    let finish!: (value: { text: string }) => void;
    mocks.selection.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    const originalSource = source();
    await act(async () => finish({ text: 'hello' }));
    expect(source()).toBe(originalSource);
    expect(source().value).toBe('hello');
    expect(target().value).toBe('привет');
    expect(mocks.translate).toHaveBeenCalledTimes(1);
  });

  it('waits for saved languages before automatically translating prefilled text', async () => {
    let finish!: (value: { from_code: string; to_code: string }) => void;
    mocks.pair.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'toolbar' });
    await open();
    expect(source().value).toBe('hello');
    expect(mocks.translate).not.toHaveBeenCalled();
    await act(async () => finish({ from_code: 'de', to_code: 'fr' }));
    expect(mocks.translate).toHaveBeenCalledExactlyOnceWith(
      { text: 'hello', from_code: 'de', to_code: 'fr' }, expect.any(AbortSignal),
    );
    expect(target().value).toBe('привет');
  });

  it('cancels automatic translation when Source is edited and ignores its late result', async () => {
    let finish!: (value: typeof result) => void;
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'toolbar' });
    mocks.translate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    expect(source().value).toBe('hello');
    expect(target().getAttribute('aria-busy')).toBe('true');
    const signal = mocks.translate.mock.calls[0][1] as AbortSignal;
    await type('new text');
    expect(signal.aborted).toBe(true);
    await act(async () => finish(result));
    expect(target().value).toBe('');
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    await submit();
    expect(mocks.translate).toHaveBeenLastCalledWith(
      { text: 'new text', from_code: 'en', to_code: 'ru' }, expect.any(AbortSignal),
    );
  });

  it('does not translate automatically if prefilled Source was cleared before languages loaded', async () => {
    let finish!: (value: { from_code: string; to_code: string }) => void;
    mocks.pair.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'toolbar' });
    await open();
    await act(async () => button('Clear').click());
    await act(async () => finish({ from_code: 'en', to_code: 'ru' }));
    expect(source().value).toBe('');
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it('allows retry after an automatic translation fails without retrying on its own', async () => {
    mocks.selection.mockResolvedValue({ text: 'hello', trigger: 'toolbar' });
    mocks.translate.mockRejectedValueOnce(new Error('Network unavailable'));
    await open();
    expect(source().value).toBe('hello');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network unavailable');
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    await submit();
    expect(target().value).toBe('привет');
    expect(mocks.translate).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: 'blank', text: '   ' },
    { label: 'oversized', text: 'a'.repeat(2001) },
  ])('does not automatically translate $label prefilled text', async ({ text }) => {
    mocks.selection.mockResolvedValue({ text, trigger: 'toolbar' });
    await open();
    expect(source().value).toBe(text);
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(button('Translate').disabled).toBe(true);
  });

  it('keeps manual input available if selection access fails', async () => {
    mocks.selection.mockRejectedValueOnce(new Error('Selection unavailable'));
    await open();
    expect(source()).not.toBeNull();
    expect(container.textContent).not.toContain('Translating…');
    await type('hello');
    await submit();
    expect(target().value).toBe('привет');
  });
});
