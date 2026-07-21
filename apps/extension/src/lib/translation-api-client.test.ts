import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translate, TranslationApiError } from './translation-api-client';
import type { TranslateRequest, TranslateResponse } from '@package/shared';

const request: TranslateRequest = { text: 'hello', from_code: 'en', to_code: 'ru' };
const successResponse: TranslateResponse = {
  source_text: 'hello',
  translated_text: 'привет',
  from_code: 'en',
  to_code: 'ru',
  can_add_to_anki: false,
};

function mockFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

function mockFetchError(err: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('translate', () => {
  it('returns translation on success', async () => {
    mockFetch(new Response(JSON.stringify(successResponse), { status: 200 }));
    const result = await translate(request, undefined, 'http://localhost:3000');
    expect(result.translated_text).toBe('привет');
    expect(result.can_add_to_anki).toBe(false);
  });

  it('throws TranslationApiError on 500', async () => {
    mockFetch(new Response('error', { status: 500 }));
    await expect(translate(request, undefined, 'http://localhost:3000')).rejects.toBeInstanceOf(TranslationApiError);
  });

  it('includes status code in error', async () => {
    mockFetch(new Response('', { status: 422 }));
    const err = await translate(request, undefined, 'http://localhost:3000').catch(e => e);
    expect(err).toBeInstanceOf(TranslationApiError);
    expect((err as TranslationApiError).status).toBe(422);
  });

  it('throws TranslationApiError on network error', async () => {
    mockFetchError(new TypeError('Failed to fetch'));
    await expect(translate(request, undefined, 'http://localhost:3000')).rejects.toBeInstanceOf(TranslationApiError);
  });

  it('re-throws AbortError unchanged', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetchError(abortError);
    const err = await translate(request, undefined, 'http://localhost:3000').catch(e => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe('AbortError');
  });
});
