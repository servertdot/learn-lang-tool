import { fetchTranslationJson, remoteLanguagePair, validatedLanguageCode } from './remote-translation-request';
import type { TranslationEngine } from './translation-facade';

function microsoftLanguageCode(code: string) {
  return code === 'zh' ? 'zh-Hans' : code;
}

export function createMicrosoftTranslationEngine(
  options: { key: string; region?: string; fetch?: typeof fetch },
): TranslationEngine {
  return {
    async translate(request, signal) {
      const { from, to } = remoteLanguagePair(request);
      const key = options.key.trim();
      if (!key) throw new Error('Enter your Microsoft Translator key in settings.');

      const url = new URL('https://api.cognitive.microsofttranslator.com/translate');
      url.searchParams.set('api-version', '3.0');
      url.searchParams.set('to', microsoftLanguageCode(to));
      if (from !== 'auto') url.searchParams.set('from', microsoftLanguageCode(from));
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
      };
      const region = options.region?.trim();
      if (region) headers['Ocp-Apim-Subscription-Region'] = region;

      const data = await fetchTranslationJson('Microsoft Translator', url, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ Text: request.text }]),
      }, options, signal);
      const result = Array.isArray(data) ? data[0] : null;
      const translated = result?.translations?.[0]?.text;
      if (typeof translated !== 'string' || !translated.trim()) {
        throw new Error('Microsoft Translator returned no translation.');
      }
      return {
        source_text: request.text,
        translated_text: translated,
        from_code: from === 'auto' ? validatedLanguageCode(result?.detectedLanguage?.language) : from,
        to_code: to,
        can_add_to_anki: true,
      };
    },
  };
}
