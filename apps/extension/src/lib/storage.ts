import browser from 'webextension-polyfill';
import type { LanguagePair, TranslationProvider } from '@package/shared';
import {
  DEFAULT_LANGUAGE_PAIR,
  DEFAULT_HOTKEY,
  DEFAULT_TRANSLATION_PROVIDER,
} from '@package/shared';
import { DEFAULT_ANKI_SETTINGS, type AnkiSettings } from './anki';

const KEYS = {
  languagePair: 'languagePair',
  hotkey: 'hotkey',
  translationProvider: 'translationProvider',
  ankiSettings: 'ankiSettings',
} as const;

export async function getLanguagePair(): Promise<LanguagePair> {
  const result = await browser.storage.sync.get(KEYS.languagePair);
  return (result[KEYS.languagePair] as LanguagePair | undefined) ?? DEFAULT_LANGUAGE_PAIR;
}

export async function setLanguagePair(pair: LanguagePair): Promise<void> {
  await browser.storage.sync.set({ [KEYS.languagePair]: pair });
}

export async function getHotkey(): Promise<string> {
  const result = await browser.storage.sync.get(KEYS.hotkey);
  return (result[KEYS.hotkey] as string | undefined) ?? DEFAULT_HOTKEY;
}

export async function setHotkey(hotkey: string): Promise<void> {
  await browser.storage.sync.set({ [KEYS.hotkey]: hotkey });
}

export async function getTranslationProvider(): Promise<TranslationProvider> {
  const result = await browser.storage.sync.get(KEYS.translationProvider);
  const provider = result[KEYS.translationProvider];
  return provider === 'bergamot' || provider === 'google'
    ? provider
    : DEFAULT_TRANSLATION_PROVIDER;
}

export async function setTranslationProvider(provider: TranslationProvider): Promise<void> {
  await browser.storage.sync.set({ [KEYS.translationProvider]: provider });
}

export async function getAnkiSettings(): Promise<AnkiSettings> {
  const result = await browser.storage.sync.get(KEYS.ankiSettings);
  const stored = result[KEYS.ankiSettings] as Partial<AnkiSettings> | undefined;
  return {
    ...DEFAULT_ANKI_SETTINGS,
    ...stored,
    tags: Array.isArray(stored?.tags) ? stored.tags : DEFAULT_ANKI_SETTINGS.tags,
    fields: {
      ...DEFAULT_ANKI_SETTINGS.fields,
      ...stored?.fields,
    },
  };
}

export async function setAnkiSettings(settings: AnkiSettings): Promise<void> {
  await browser.storage.sync.set({ [KEYS.ankiSettings]: settings });
}
