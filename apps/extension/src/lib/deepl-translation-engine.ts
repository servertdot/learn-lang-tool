import { fetchTranslationJson, remoteLanguagePair, validatedLanguageCode } from './remote-translation-request';
import type { TranslationEngine } from './translation-facade';

const PROXY_TRANSLATE_URL = new URL('http://localhost:3000/v2/translate');

// The language picker offers base codes. DeepL accepts explicit target varieties.
const TARGET_VARIANTS: Readonly<Record<string, string>> = {
  en: 'EN-US',
  pt: 'PT-PT',
  zh: 'ZH-HANS',
};

export function createDeepLTranslationEngine(
  options: { fetch?: typeof fetch } = {},
): TranslationEngine {
  return {
    async translate(request, signal) {
      const { from, to } = remoteLanguagePair(request);
      const body = {
        text: [request.text],
        source_lang: from === 'auto' ? undefined : from.toUpperCase(),
        target_lang: TARGET_VARIANTS[to] ?? to.toUpperCase(),
      };
      const result = await fetchTranslationJson('DeepL proxy', PROXY_TRANSLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, options, signal);

      const translations = (result as { translations?: unknown } | null)?.translations;
      const entry = Array.isArray(translations) ? translations[0] : undefined;
      if (typeof entry?.text !== 'string' || !entry.text.trim()) {
        throw new Error('DeepL returned an empty or invalid translation.');
      }
      return {
        source_text: request.text,
        translated_text: entry.text,
        from_code: from === 'auto' ? validatedLanguageCode(entry.detected_source_language) : from,
        to_code: to,
        can_add_to_anki: true,
      };
    },
  };
}
