import type { TranslateRequest, TranslateResponse } from '@package/shared';
import type { TranslationEngine } from './translation-facade';
import { translateWithGoogle, type GoogleTranslationClientOptions } from './google-translation-client';

export function createGoogleTranslationEngine(
  options: GoogleTranslationClientOptions = {},
): TranslationEngine {
  return {
    async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
      const translatedText = await translateWithGoogle(
        request.text,
        request.from_code,
        request.to_code,
        signal,
        options,
      );

      return {
        source_text: request.text,
        translated_text: translatedText,
        from_code: request.from_code,
        to_code: request.to_code,
        can_add_to_anki: true,
      };
    },
  };
}
