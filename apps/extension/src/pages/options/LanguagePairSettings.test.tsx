// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LanguagePair } from '@package/shared';
import Options from './Options';
import { PopupTranslator } from '../popup/PopupTranslator';
import { setTranslationProvider } from '@src/lib/storage';

const storage = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  listeners: new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>(),
  get: vi.fn(),
  set: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: async () => ({ type: 'llt.modelPack.status', status: 'missing' }) },
    storage: {
      sync: { get: storage.get, set: storage.set },
      onChanged: {
        addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => storage.listeners.add(listener),
        removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => storage.listeners.delete(listener),
      },
    },
  },
}));
vi.mock('@src/lib/product-translator', () => ({
  createProductTranslationFacade: () => ({ translate: storage.translate }),
}));

let container: HTMLDivElement;
let root: Root;

function emit(pair: LanguagePair | undefined, area = 'sync') {
  for (const listener of storage.listeners) listener({ languagePair: { newValue: pair } }, area);
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.data = {};
  storage.listeners.clear();
  storage.get.mockImplementation(async (key: string) => ({ [key]: storage.data[key] }));
  storage.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(storage.data, values);
    if ('languagePair' in values) emit(values.languagePair as LanguagePair);
  });
  storage.translate.mockResolvedValue({ translated_text: 'привет' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', {
    runtime: {
      openOptionsPage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn(async () => ({
        ok: true, deckNames: [], modelNames: [], count: 0, failedCount: 0,
      })),
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(storage.listeners.size).toBe(0);
  container.remove();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () => root.render(
    <>
      <div data-window="options"><Options /></div>
      <div data-window="popup"><PopupTranslator /></div>
    </>,
  ));
}

function windowElement(name: string) {
  return container.querySelector<HTMLDivElement>(`[data-window="${name}"]`)!;
}

function selects(name: string) {
  return windowElement(name).querySelectorAll<HTMLSelectElement>('.language-pair-controls select');
}

function pair(name: string) {
  const fields = selects(name);
  return [fields[0].value, fields[1].value];
}

async function select(name: string, field: number, code: string) {
  await act(async () => {
    const control = selects(name)[field];
    control.value = code;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function swap(name: string) {
  await act(async () => windowElement(name).querySelector<HTMLButtonElement>('[aria-label="Swap languages"]')!.click());
}

describe('shared language pair settings', () => {
  it('selects English in both windows when switching from Auto-Detect to Bergamot', async () => {
    storage.data.languagePair = { from_code: 'auto', to_code: 'es' };
    await open();
    await act(async () => {
      const provider = windowElement('options').querySelector<HTMLSelectElement>('#translation-provider')!;
      provider.value = 'bergamot';
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(pair('options')).toEqual(['en', 'es']);
    expect(pair('popup')).toEqual(['en', 'es']);
    expect(storage.data.languagePair).toEqual({ from_code: 'en', to_code: 'es' });
    await act(async () => windowElement('options').querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(storage.data.translationProvider).toBe('bergamot');
  });

  it('loads English for an existing Auto-Detect setting with Bergamot and keeps it on subsequent writes', async () => {
    storage.data.translationProvider = 'bergamot';
    storage.data.languagePair = { from_code: 'auto', to_code: 'ru' };
    await open();
    expect(pair('options')).toEqual(['en', 'ru']);
    expect(pair('popup')).toEqual(['en', 'ru']);
    await select('popup', 0, 'auto');
    expect(pair('popup')).toEqual(['en', 'ru']);
    expect(pair('options')).toEqual(['en', 'ru']);
    expect(storage.data.languagePair).toEqual({ from_code: 'en', to_code: 'ru' });
  });

  it('persists an English source when saving Bergamot with an Auto-Detect pair', async () => {
    storage.data.languagePair = { from_code: 'auto', to_code: 'ru' };
    await open();
    await act(async () => setTranslationProvider('bergamot'));
    expect(storage.set).toHaveBeenLastCalledWith({
      translationProvider: 'bergamot', languagePair: { from_code: 'en', to_code: 'ru' },
    });
    expect(pair('popup')).toEqual(['en', 'ru']);
  });

  it('preserves explicit languages when saving Bergamot', async () => {
    storage.data.languagePair = { from_code: 'de', to_code: 'fr' };
    await open();
    await act(async () => setTranslationProvider('bergamot'));
    expect(storage.set).toHaveBeenLastCalledWith({ translationProvider: 'bergamot' });
    expect(pair('popup')).toEqual(['de', 'fr']);
  });

  it('shares Auto-Detect as source only and prevents swapping it into the target', async () => {
    await open();
    await select('options', 0, 'auto');
    expect(pair('popup')).toEqual(['auto', 'ru']);
    expect(storage.data.languagePair).toEqual({ from_code: 'auto', to_code: 'ru' });
    for (const name of ['options', 'popup']) {
      expect([...selects(name)[1].options].some(option => option.value === 'auto')).toBe(false);
      expect(windowElement(name).querySelector<HTMLButtonElement>('[aria-label="Swap languages"]')!.disabled).toBe(true);
      expect(windowElement(name).querySelector('.language-pair-note')).toBeNull();
    }
    await act(async () => root.render(null));
    await open();
    expect(pair('popup')).toEqual(['auto', 'ru']);
    await act(async () => {
      const source = windowElement('popup').querySelector<HTMLTextAreaElement>('#translator-source')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, 'hola');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => windowElement('popup').querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(storage.translate).toHaveBeenCalledWith(
      { text: 'hola', from_code: 'auto', to_code: 'ru' }, expect.any(AbortSignal),
    );
    await select('popup', 0, 'es');
    expect(windowElement('popup').querySelector<HTMLButtonElement>('[aria-label="Swap languages"]')!.disabled).toBe(false);
  });

  it('repairs a saved auto target while preserving an auto source', async () => {
    storage.data.languagePair = { from_code: 'auto', to_code: ' AUTO ' };
    await open();
    expect(pair('options')).toEqual(['auto', 'ru']);
    expect(pair('popup')).toEqual(['auto', 'ru']);
  });

  it('loads the same languages in both windows and persists changes in both directions', async () => {
    storage.data.languagePair = { from_code: 'de', to_code: 'fr' };
    await open();
    expect(pair('options')).toEqual(['de', 'fr']);
    expect(pair('popup')).toEqual(['de', 'fr']);
    expect([...selects('options')[0].options].map(option => option.textContent))
      .toEqual([...selects('popup')[0].options].map(option => option.textContent));

    await select('options', 0, 'es');
    expect(pair('popup')).toEqual(['es', 'fr']);
    await select('popup', 1, 'it');
    expect(pair('options')).toEqual(['es', 'it']);
    expect(storage.data.languagePair).toEqual({ from_code: 'es', to_code: 'it' });

    await act(async () => root.render(null));
    await open();
    expect(pair('popup')).toEqual(['es', 'it']);
    expect(pair('options')).toEqual(['es', 'it']);
  });

  it('persists swaps from both windows without submitting the settings form', async () => {
    await open();
    await swap('options');
    expect(pair('popup')).toEqual(['ru', 'en']);
    expect(storage.set).toHaveBeenLastCalledWith({ languagePair: { from_code: 'ru', to_code: 'en' } });
    await swap('popup');
    expect(pair('options')).toEqual(['en', 'ru']);
    expect(storage.set).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite the shared pair when saving other translation settings', async () => {
    await open();
    await select('popup', 1, 'es');
    storage.set.mockClear();
    await act(async () => windowElement('options').querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(storage.data.languagePair).toEqual({ from_code: 'en', to_code: 'es' });
    expect(storage.set.mock.calls.some(([values]) => 'languagePair' in values)).toBe(false);
  });

  it('keeps previously configured codes that are outside the language list', async () => {
    storage.data.languagePair = { from_code: ' EN ', to_code: 'SV' };
    await open();
    expect(pair('options')).toEqual(['en', 'sv']);
    expect(pair('popup')).toEqual(['en', 'sv']);
    expect(selects('options')[1].selectedOptions[0].textContent).toBe('SV');
    await swap('options');
    expect(pair('popup')).toEqual(['sv', 'en']);
  });

  it('keeps the saved pair and reports a failed write so the user can retry', async () => {
    await open();
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await select('options', 1, 'es');
    expect(pair('options')).toEqual(['en', 'ru']);
    expect(pair('popup')).toEqual(['en', 'ru']);
    expect(windowElement('options').querySelector('[role="alert"]')?.textContent).toContain('Could not save');
    expect(selects('options')[1].disabled).toBe(false);
    await select('options', 1, 'es');
    expect(pair('popup')).toEqual(['en', 'es']);
    expect(windowElement('options').querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores changes outside sync storage and restores defaults after removal', async () => {
    storage.data.languagePair = { from_code: 'de', to_code: 'fr' };
    await open();
    await act(async () => emit({ from_code: 'es', to_code: 'it' }, 'local'));
    expect(pair('popup')).toEqual(['de', 'fr']);
    await act(async () => emit(undefined));
    expect(pair('options')).toEqual(['en', 'ru']);
    expect(pair('popup')).toEqual(['en', 'ru']);
  });

  it('keeps the original source text if saving a swap fails', async () => {
    await open();
    await act(async () => {
      const source = windowElement('popup').querySelector<HTMLTextAreaElement>('#translator-source')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, 'hello');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => windowElement('popup').querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await swap('popup');
    expect(pair('popup')).toEqual(['en', 'ru']);
    expect(windowElement('popup').querySelector<HTMLTextAreaElement>('#translator-source')!.value).toBe('hello');
    expect(windowElement('popup').querySelector('[role="alert"]')?.textContent).toContain('Could not save');
  });

  it('ignores a stale initial read after receiving a newer saved pair', async () => {
    let finish!: (value: Record<string, unknown>) => void;
    storage.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    expect(selects('options')[0].disabled).toBe(true);
    await select('popup', 1, 'fr');
    await act(async () => finish({ languagePair: { from_code: 'en', to_code: 'ru' } }));
    expect(pair('options')).toEqual(['en', 'fr']);
    expect(pair('popup')).toEqual(['en', 'fr']);
  });

  it('cancels an in-flight translation when settings change in the other window', async () => {
    await open();
    let finish!: (result: { translated_text: string }) => void;
    storage.translate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => {
      const source = windowElement('popup').querySelector<HTMLTextAreaElement>('#translator-source')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, 'hello');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => windowElement('popup').querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const signal = storage.translate.mock.calls[0][1] as AbortSignal;
    await select('options', 1, 'es');
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ translated_text: 'old result' }));
    expect(windowElement('popup').querySelector<HTMLTextAreaElement>('#translator-target')!.value).toBe('');
  });
});
