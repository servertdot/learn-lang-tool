import type { TranslateRequest, TranslateResponse } from '@package/shared';

export type TranslationFacadeErrorCode =
  | 'engine_failure'
  | 'model_pack_missing'
  | 'text_too_long';

export class TranslationFacadeError extends Error {
  constructor(
    public readonly code: TranslationFacadeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranslationFacadeError';
  }
}

export interface TranslationEngine {
  translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse>;
}

export interface TranslationFacade {
  translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse>;
}

export interface TranslationFacadeOptions {
  maxLength?: number;
}

export function createTranslationFacade(
  engine: TranslationEngine,
  options: TranslationFacadeOptions = {},
): TranslationFacade {
  const maxLength = options.maxLength;

  return {
    async translate(request, signal) {
      if (maxLength !== undefined && request.text.length > maxLength) {
        throw new TranslationFacadeError(
          'text_too_long',
          `Text is too long (max ${maxLength} characters)`,
        );
      }

      try {
        return await engine.translate(request, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (err instanceof TranslationFacadeError) {
          throw err;
        }
        const message = err instanceof Error ? err.message : 'Translation failed';
        throw new TranslationFacadeError('engine_failure', message);
      }
    },
  };
}
