import { describe, expect, it, vi } from 'vitest';
import { TtsError, type PronunciationRequest } from './audio-tts-provider';
import {
  GOOGLE_TRANSLATE_TTS_MAX_CHARS,
  GOOGLE_TRANSLATE_TTS_PROVIDER_ID,
  GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION,
  buildGoogleTranslatePronunciationRequest,
  createGoogleTranslateTtsProvider,
  splitGoogleTranslateTtsText,
} from './google-translate-tts-provider';

function request(overrides: Partial<PronunciationRequest> = {}): PronunciationRequest {
  return {
    text: 'Hello world.',
    language: 'en',
    providerId: GOOGLE_TRANSLATE_TTS_PROVIDER_ID,
    providerRevision: GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION,
    voiceId: 'google-translate-web:en',
    speed: 1,
    encodingVersion: 2,
    ...overrides,
  };
}

function audioResponse(bytes: number[] = [0xff, 0xfb, 0x90, 0x64]): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

describe('splitGoogleTranslateTtsText', () => {
  it('prefers sentence and word boundaries while preserving the exact text', () => {
    const text = 'First sentence. Second sentence with words.';
    const chunks = splitGoogleTranslateTtsText(text, 20);

    expect(chunks).toEqual(['First sentence. ', 'Second sentence ', 'with words.']);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(chunk => Array.from(chunk).length <= 20)).toBe(true);
  });

  it('splits long tokens only at Unicode code-point boundaries', () => {
    const text = '😀😀😀😀😀';
    const chunks = splitGoogleTranslateTtsText(text, 2);

    expect(chunks).toEqual(['😀😀', '😀😀', '😀']);
    expect(chunks.join('')).toBe(text);
    expect(chunks.some(chunk => chunk.includes('\uFFFD'))).toBe(false);
  });

  it.each([
    ['abcdefghij', 4],
    ['one   two\nthree', 7],
    ['First! Second? Third。', 9],
  ])('reconstructs punctuation, words, and whitespace for %j', (text, limit) => {
    const chunks = splitGoogleTranslateTtsText(text, limit);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(chunk => Array.from(chunk).length <= limit)).toBe(true);
  });
});

describe('Google Translate web TTS provider', () => {
  it('builds a durable provider-neutral request for any valid speech language', () => {
    expect(buildGoogleTranslatePronunciationRequest({ text: 'hola', language: 'es-MX' })).toEqual({
      text: 'hola',
      language: 'es-mx',
      providerId: GOOGLE_TRANSLATE_TTS_PROVIDER_ID,
      providerRevision: GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION,
      voiceId: 'google-translate-web:es-mx',
      speed: 1,
      encodingVersion: 2,
    });
  });

  it('uses the fixed endpoint with privacy-safe request options and assembles chunks in order', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(audioResponse([1])).mockResolvedValueOnce(audioResponse([2]));
    const assembleAudio = vi.fn(async (chunks: readonly Uint8Array[]) => ({
      bytes: Uint8Array.from(chunks.flatMap(chunk => [...chunk])),
      sampleRate: 24_000,
    }));
    const provider = createGoogleTranslateTtsProvider({
      fetch: fetchMock,
      maxCharsPerRequest: 8,
      assembleAudio,
      validateAudio: vi.fn().mockResolvedValue(undefined),
    });

    const artifact = await provider.synthesize(request({ text: 'Hello. World.' }));

    expect(artifact.bytes).toEqual(new Uint8Array([1, 2]));
    expect(artifact).toMatchObject({
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      language: 'en',
      voiceId: 'google-translate-web:en',
      sampleRate: 24_000,
    });
    expect(assembleAudio).toHaveBeenCalledWith(
      [new Uint8Array([1]), new Uint8Array([2])],
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [rawUrl, init] of fetchMock.mock.calls) {
      const url = new URL(rawUrl as string);
      expect(url.origin).toBe('https://translate.google.com');
      expect(url.pathname).toBe('/translate_tts');
      expect(url.searchParams.get('tl')).toBe('en');
      expect(url.searchParams.get('q')).not.toBeNull();
      expect(init).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
    }
  });

  it('rejects invalid languages before making endpoint traffic', async () => {
    const fetchMock = vi.fn();
    const provider = createGoogleTranslateTtsProvider({ fetch: fetchMock });

    await expect(
      provider.synthesize(request({ language: 'evil.example/path' })),
    ).rejects.toMatchObject({ code: 'language_unsupported' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['non-success status', new Response('no', { status: 429 })],
    ['wrong MIME type', new Response('<html>no</html>', { headers: { 'content-type': 'text/html' } })],
    ['empty audio', audioResponse([])],
  ])('treats %s as a provider failure', async (_case, response) => {
    const provider = createGoogleTranslateTtsProvider({
      fetch: vi.fn().mockResolvedValue(response),
      assembleAudio: vi.fn(),
    });

    await expect(provider.synthesize(request())).rejects.toBeInstanceOf(TtsError);
  });

  it('rejects declared and streamed oversized responses', async () => {
    const declared = audioResponse([1]);
    declared.headers.set('content-length', '20');
    const streamed = audioResponse(new Array(20).fill(1));

    for (const response of [declared, streamed]) {
      const provider = createGoogleTranslateTtsProvider({
        fetch: vi.fn().mockResolvedValue(response),
        maxChunkResponseBytes: 10,
        assembleAudio: vi.fn(),
      });
      await expect(provider.synthesize(request())).rejects.toMatchObject({
        code: 'generation_failed',
      });
    }
  });

  it('treats caller cancellation as terminal cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
    );
    const provider = createGoogleTranslateTtsProvider({ fetch: fetchMock as typeof fetch });

    const pending = provider.synthesize(request(), controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'request_cancelled' });
  });

  it('enforces the five-second-style per-request deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
    );
    const provider = createGoogleTranslateTtsProvider({
      fetch: fetchMock as typeof fetch,
      requestTimeoutMs: 10,
    });

    const pending = provider.synthesize(request());
    const expectation = expect(pending).rejects.toMatchObject({
      code: 'generation_timed_out',
    });
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    vi.useRealTimers();
  });

  it('rejects audio that cannot be decoded and assembled', async () => {
    const provider = createGoogleTranslateTtsProvider({
      fetch: vi.fn().mockResolvedValue(audioResponse()),
      assembleAudio: vi.fn().mockRejectedValue(new Error('decode failed')),
    });

    await expect(provider.synthesize(request())).rejects.toMatchObject({
      code: 'artifact_encoding_failed',
    });
  });

  it('rejects an assembled artifact that is not decodable', async () => {
    const validateAudio = vi.fn().mockRejectedValue(new Error('invalid final mp3'));
    const provider = createGoogleTranslateTtsProvider({
      fetch: vi.fn().mockResolvedValue(audioResponse()),
      assembleAudio: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([1, 2, 3]),
        sampleRate: 24_000,
      }),
      validateAudio,
    });

    await expect(provider.synthesize(request())).rejects.toMatchObject({
      code: 'artifact_encoding_failed',
    });
    expect(validateAudio).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.any(AbortSignal),
    );
  });

  it('uses the conservative probed request limit by default', () => {
    expect(GOOGLE_TRANSLATE_TTS_MAX_CHARS).toBe(200);
  });
});
