import type { TranslateRequest, TranslateResponse } from '@package/shared';
import { API_BASE_URL } from '@package/shared';
import { translate as translateViaHttp, TranslationApiError } from './translation-api-client';
import type { TranslationEngine } from './translation-facade';
import { TranslationFacadeError } from './translation-facade';

export function createHttpTranslationEngine(baseUrl: string = API_BASE_URL): TranslationEngine {
  return {
    async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
      try {
        return await translateViaHttp(request, signal, baseUrl);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (err instanceof TranslationApiError) {
          throw new TranslationFacadeError(
            'engine_failure',
            err.message || 'Translation failed',
          );
        }
        throw err;
      }
    },
  };
}
