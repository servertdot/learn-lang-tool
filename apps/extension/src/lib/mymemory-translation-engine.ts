import { MYMEMORY_MAX_TEXT_BYTES } from '@package/shared';
import { fetchTranslationJson, remoteLanguagePair } from './remote-translation-request';
import { TranslationFacadeError, type TranslationEngine } from './translation-facade';

export function createMyMemoryTranslationEngine(
  options: { email?: string; fetch?: typeof fetch } = {},
): TranslationEngine {
  return {
    async translate(request, signal) {
      const { from, to } = remoteLanguagePair(request);
      if (from === 'auto') {
        throw new Error('Choose a source language to translate with MyMemory.');
      }
      if (new TextEncoder().encode(request.text).byteLength > MYMEMORY_MAX_TEXT_BYTES) {
        throw new TranslationFacadeError(
          'text_too_long',
          `MyMemory accepts up to ${MYMEMORY_MAX_TEXT_BYTES} UTF-8 bytes. Select a shorter passage.`,
        );
      }
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', request.text);
      url.searchParams.set('langpair', `${from}|${to}`);
      const email = options.email?.trim();
      if (email) url.searchParams.set('de', email);

      const data = await fetchTranslationJson('MyMemory', url, { method: 'GET' }, options, signal) as {
        responseStatus?: unknown;
        responseData?: { translatedText?: unknown };
        quotaFinished?: unknown;
      } | null;
      if (data?.quotaFinished === true || Number(data?.responseStatus) === 429) {
        throw new Error('MyMemory daily quota reached. Try again later or choose another provider.');
      }
      const translated = data?.responseData?.translatedText;
      if (Number(data?.responseStatus) !== 200 || typeof translated !== 'string' || !translated.trim()) {
        throw new Error('MyMemory could not translate this selection.');
      }
      return {
        source_text: request.text,
        translated_text: translated,
        from_code: from,
        to_code: to,
        can_add_to_anki: true,
      };
    },
  };
}
