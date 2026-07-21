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

export const DEFAULT_LANGUAGE_PAIR: LanguagePair = {
  from_code: 'en',
  to_code: 'ru',
};

export const DEFAULT_HOTKEY = 'Alt';

// For local development, `apps/api` defaults to port 3000 (see apps/api/src/index.ts).
// Keep this in sync with manifest host_permissions in apps/extension/manifest.json.
export const API_BASE_URL = 'http://localhost:3000';
