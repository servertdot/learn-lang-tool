import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TranslateRequest, TranslateResponse } from '@package/shared';
import {
  createTranslationFacade,
  TranslationFacadeError,
  type TranslationEngine,
} from './translation-facade';

const request: TranslateRequest = { text: 'hello', from_code: 'en', to_code: 'ru' };

const successResult: TranslateResponse = {
  source_text: 'hello',
  translated_text: 'привет',
  from_code: 'en',
  to_code: 'ru',
  can_add_to_anki: true,
};

describe('translation facade', () => {
  let engine: TranslationEngine;

  beforeEach(() => {
    engine = {
      translate: vi.fn().mockResolvedValue(successResult),
    };
  });

  it('returns translation result from the engine on success', async () => {
    const facade = createTranslationFacade(engine);
    const result = await facade.translate(request);
    expect(result).toEqual(successResult);
    expect(engine.translate).toHaveBeenCalledWith(request, undefined);
  });

  it('forwards AbortSignal to the engine', async () => {
    const facade = createTranslationFacade(engine);
    const controller = new AbortController();
    await facade.translate(request, controller.signal);
    expect(engine.translate).toHaveBeenCalledWith(request, controller.signal);
  });

  it('re-throws AbortError unchanged', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    engine.translate = vi.fn().mockRejectedValue(abortError);
    const facade = createTranslationFacade(engine);
    await expect(facade.translate(request)).rejects.toSatisfy(
      (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
    );
  });

  it('wraps unknown engine failures as TranslationFacadeError', async () => {
    engine.translate = vi.fn().mockRejectedValue(new Error('boom'));
    const facade = createTranslationFacade(engine);
    await expect(facade.translate(request)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof TranslationFacadeError &&
        err.code === 'engine_failure' &&
        err.message.length > 0
      );
    });
  });

  it('passes through TranslationFacadeError from the engine', async () => {
    const missing = new TranslationFacadeError('model_pack_missing', 'Install the model pack');
    engine.translate = vi.fn().mockRejectedValue(missing);
    const facade = createTranslationFacade(engine);
    await expect(facade.translate(request)).rejects.toBe(missing);
  });

  it('rejects oversized text before calling the engine', async () => {
    const facade = createTranslationFacade(engine, { maxLength: 10 });
    const long: TranslateRequest = { ...request, text: 'a'.repeat(11) };
    await expect(facade.translate(long)).rejects.toSatisfy(
      (err: unknown) => err instanceof TranslationFacadeError && err.code === 'text_too_long',
    );
    expect(engine.translate).not.toHaveBeenCalled();
  });
});
