import browser from 'webextension-polyfill';

export interface TranslationProviderSettings {
  myMemoryEmail: string;
  microsoftKey: string;
  microsoftRegion: string;
}

const defaults: TranslationProviderSettings = {
  myMemoryEmail: '',
  microsoftKey: '',
  microsoftRegion: '',
};

export async function readTranslationProviderSettings(): Promise<TranslationProviderSettings> {
  const stored = await browser.storage.local.get(Object.keys(defaults));
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof TranslationProviderSettings)[]) {
    if (typeof stored[key] === 'string') settings[key] = stored[key];
  }
  return settings;
}

export async function saveTranslationProviderSettings(patch: Partial<TranslationProviderSettings>): Promise<void> {
  await browser.storage.local.set(patch);
}
