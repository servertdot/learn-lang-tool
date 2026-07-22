import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  cancelSpeechModelPackInstall,
  installSpeechModelPackFiles,
  SPEECH_MODEL_CACHE_NAME,
} from './speech-model-pack-installer';
import { KOKORO_EN_SPEECH_PACK, speechModelFileUrl } from './speech-model-pack-registry';

function mockCaches() {
  const store = new Map<string, Response>();
  const cache = {
    async match(request: RequestInfo) {
      const url = typeof request === 'string' ? request : request.url;
      return store.get(url) ?? undefined;
    },
    async put(request: RequestInfo, response: Response) {
      const url = typeof request === 'string' ? request : request.url;
      store.set(url, response);
    },
  };
  vi.stubGlobal('caches', {
    open: async () => cache,
  });
  return store;
}

describe('installSpeechModelPackFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cancelSpeechModelPackInstall();
    vi.unstubAllGlobals();
  });

  it('downloads missing pinned files into the speech model cache', async () => {
    const store = mockCaches();
    const fetchMock = vi.fn(async (url: string) => {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await installSpeechModelPackFiles(KOKORO_EN_SPEECH_PACK.id);

    expect(fetchMock).toHaveBeenCalled();
    for (const file of KOKORO_EN_SPEECH_PACK.files) {
      const url = speechModelFileUrl(KOKORO_EN_SPEECH_PACK, file.path);
      expect(store.has(url)).toBe(true);
    }
    expect(SPEECH_MODEL_CACHE_NAME).toBe('llt-kokoro-models-v1');
  });

  it('skips files that are already cached', async () => {
    const store = mockCaches();
    const firstFile = KOKORO_EN_SPEECH_PACK.files[0]!;
    const url = speechModelFileUrl(KOKORO_EN_SPEECH_PACK, firstFile.path);
    store.set(url, new Response(new Uint8Array([9]), { status: 200 }));

    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await installSpeechModelPackFiles(KOKORO_EN_SPEECH_PACK.id);

    const fetchedUrls = fetchMock.mock.calls.map(call => String(call.at(0)));
    expect(fetchedUrls).not.toContain(url);
  });

  it('supports cancellation mid-install', async () => {
    mockCaches();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );

    const pending = installSpeechModelPackFiles(KOKORO_EN_SPEECH_PACK.id);
    // Allow the install loop to reach the hanging fetch.
    await Promise.resolve();
    cancelSpeechModelPackInstall();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
