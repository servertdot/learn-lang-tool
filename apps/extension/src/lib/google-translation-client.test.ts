import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleTranslationError,
  translateWithGoogle,
} from './google-translation-client';

function successfulResponse(text = 'привет'): Response {
  return new Response(JSON.stringify([[[text, 'hello', null, null, 10]], null, 'en']), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Google translation client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses only the fixed Google host and explicit language pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse());

    const result = await translateWithGoogle('hello', 'en', 'ru', undefined, {
      fetch: fetchMock,
    });

    expect(result).toEqual({ translatedText: 'привет', fromCode: 'en' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://translate.google.com');
    expect(url.pathname).toBe('/translate_a/single');
    expect(url.searchParams.get('sl')).toBe('en');
    expect(url.searchParams.get('tl')).toBe('ru');
    expect(url.searchParams.get('q')).toBe('hello');
    expect(url.searchParams.get('tk')).toMatch(/^\d+\.\d+$/);
  });

  it('joins all translated response segments', async () => {
    const response = new Response(
      JSON.stringify([[["как ", 'how '], ['дела', 'are things']], null, 'en']),
    );
    await expect(
      translateWithGoogle('how are things', 'en', 'ru', undefined, {
        fetch: vi.fn().mockResolvedValue(response),
      }),
    ).resolves.toEqual({ translatedText: 'как дела', fromCode: 'en' });
  });

  it('detects the source language in the same translation request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify([[['привет', 'hola']], null, 'es']),
    ));
    await expect(translateWithGoogle('hola', 'auto', 'ru', undefined, { fetch: fetchMock }))
      .resolves.toEqual({ translatedText: 'привет', fromCode: 'es' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('sl')).toBe('auto');
  });

  it.each([undefined, 'auto', 'und', 'not-a-language', 42])(
    'rejects an auto-detected response without a valid source language (%s)', async detected => {
      await expect(translateWithGoogle('hola', 'auto', 'ru', undefined, {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify([[['привет']], null, detected]))),
      })).rejects.toMatchObject({ kind: 'response' });
    },
  );

  it('rejects auto as a target language before making a request', async () => {
    const fetchMock = vi.fn();
    await expect(translateWithGoogle('hello', 'en', 'auto', undefined, { fetch: fetchMock }))
      .rejects.toMatchObject({ kind: 'invalid_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid language codes before making a request', async () => {
    const fetchMock = vi.fn();
    await expect(
      translateWithGoogle('hello', 'com.attacker.example', 'ru', undefined, {
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized input before making a request', async () => {
    const fetchMock = vi.fn();
    await expect(
      translateWithGoogle('a'.repeat(2001), 'en', 'ru', undefined, { fetch: fetchMock }),
    ).rejects.toBeInstanceOf(GoogleTranslationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized responses while streaming', async () => {
    const response = new Response('x'.repeat(20));
    await expect(
      translateWithGoogle('hello', 'en', 'ru', undefined, {
        fetch: vi.fn().mockResolvedValue(response),
        maxResponseBytes: 10,
      }),
    ).rejects.toMatchObject({ kind: 'response' });
  });

  it('rejects malformed responses', async () => {
    await expect(
      translateWithGoogle('hello', 'en', 'ru', undefined, {
        fetch: vi.fn().mockResolvedValue(new Response('{nope')),
      }),
    ).rejects.toMatchObject({ kind: 'response' });
  });

  it('forwards caller cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    });
    const promise = translateWithGoogle('hello', 'en', 'ru', controller.signal, {
      fetch: fetchMock as typeof fetch,
    });
    controller.abort();
    await expect(promise).rejects.toSatisfy(
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
  });

  it('turns the internal deadline into a timeout error', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    });
    const promise = translateWithGoogle('hello', 'en', 'ru', undefined, {
      fetch: fetchMock as typeof fetch,
      timeoutMs: 10,
    });
    const expectation = expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    vi.useRealTimers();
  });
});
