import browser from 'webextension-polyfill';
import type { LanguagePair, TranslationProvider } from '@package/shared';
import {
  DEFAULT_LANGUAGE_PAIR,
  DEFAULT_HOTKEY,
  DEFAULT_TRANSLATION_PROVIDER,
} from '@package/shared';
import {
  DEFAULT_ANKI_SETTINGS,
  isAnkiFieldValue,
  type AnkiFieldMappings,
  type AnkiSettings,
} from './anki';

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
  const stored = result[KEYS.ankiSettings] as
    | (Partial<AnkiSettings> & {
        fields?: {
          expression?: string;
          sentence?: string;
          glossary?: string;
        };
      })
    | undefined;

  const storedMappings = Object.fromEntries(
    Object.entries(stored?.fieldMappings ?? {}).filter(
      (entry): entry is [string, AnkiFieldMappings[string]] =>
        entry[1] === null || isAnkiFieldValue(entry[1]),
    ),
  );
  const legacyMappings: AnkiFieldMappings = {};
  if (stored?.fields?.expression) legacyMappings[stored.fields.expression] = 'textFrom';
  if (stored?.fields?.glossary) legacyMappings[stored.fields.glossary] = 'textTo';
  if (stored?.fields?.sentence) legacyMappings[stored.fields.sentence] = 'sentence';

  return {
    name: typeof stored?.name === 'string' ? stored.name : DEFAULT_ANKI_SETTINGS.name,
    serverAddress:
      typeof stored?.serverAddress === 'string'
        ? stored.serverAddress
        : DEFAULT_ANKI_SETTINGS.serverAddress,
    apiKey: typeof stored?.apiKey === 'string' ? stored.apiKey : DEFAULT_ANKI_SETTINGS.apiKey,
    deckName:
      typeof stored?.deckName === 'string' ? stored.deckName : DEFAULT_ANKI_SETTINGS.deckName,
    modelName:
      typeof stored?.modelName === 'string' ? stored.modelName : DEFAULT_ANKI_SETTINGS.modelName,
    tags: Array.isArray(stored?.tags)
      ? stored.tags.filter((tag): tag is string => typeof tag === 'string')
      : DEFAULT_ANKI_SETTINGS.tags,
    fieldMappings:
      Object.keys(storedMappings).length > 0
        ? storedMappings
        : Object.keys(legacyMappings).length > 0
          ? legacyMappings
          : DEFAULT_ANKI_SETTINGS.fieldMappings,
  };
}

export async function setAnkiSettings(settings: AnkiSettings): Promise<void> {
  await browser.storage.sync.set({ [KEYS.ankiSettings]: settings });
}
