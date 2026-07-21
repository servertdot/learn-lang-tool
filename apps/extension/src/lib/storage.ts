import browser from 'webextension-polyfill';
import type { LanguagePair } from '@package/shared';
import { DEFAULT_LANGUAGE_PAIR, DEFAULT_HOTKEY } from '@package/shared';

const KEYS = {
  languagePair: 'languagePair',
  hotkey: 'hotkey',
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
