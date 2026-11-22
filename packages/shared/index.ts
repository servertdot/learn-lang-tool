export interface LanguagePair {
  from_code: string;
  to_code: string;
}

export interface TranslateRequest {
  text: string;
  from_code: string;
  to_code: string;
}

export interface TranslateResponse {
  source_text: string;
  translated_text: string;
  from_code: string;
  to_code: string;
  can_add_to_anki: boolean;
}

export const TRANSLATION_PROVIDERS = ['google', 'bergamot', 'mymemory', 'microsoft', 'deepl'] as const;
export type TranslationProvider = typeof TRANSLATION_PROVIDERS[number];

export function isTranslationProvider(value: unknown): value is TranslationProvider {
  return TRANSLATION_PROVIDERS.some(provider => provider === value);
}

export function supportsAutoSource(provider: TranslationProvider): boolean {
  return provider !== 'bergamot' && provider !== 'mymemory';
}

export const DEFAULT_LANGUAGE_PAIR: LanguagePair = {
  from_code: 'en',
  to_code: 'ru',
};

export const DEFAULT_HOTKEY = 'Alt';

/** Quality-first by default; users can opt back into fully local Bergamot. */
export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = 'google';

/** Max characters accepted in a translation request on the product path. */
export const MAX_TRANSLATION_TEXT_LENGTH = 2000;
export const MYMEMORY_MAX_TEXT_BYTES = 500;

// Optional legacy translation backend (dev / experiments).
// Keep in sync with optional host_permissions if the HTTP adapter is used.
export const API_BASE_URL = 'http://localhost:3000';
