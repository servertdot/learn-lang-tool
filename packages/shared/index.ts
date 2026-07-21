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

export type TranslationProvider = 'google' | 'bergamot';

export const DEFAULT_LANGUAGE_PAIR: LanguagePair = {
  from_code: 'en',
  to_code: 'ru',
};

export const DEFAULT_HOTKEY = 'Alt';

/** Quality-first by default; users can opt back into fully local Bergamot. */
export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = 'google';

/** Max characters accepted in a translation request on the product path. */
export const MAX_TRANSLATION_TEXT_LENGTH = 2000;

// Optional legacy translation backend (dev / experiments).
// Keep in sync with optional host_permissions if the HTTP adapter is used.
export const API_BASE_URL = 'http://localhost:3000';
