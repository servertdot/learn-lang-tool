import {
  getSpeechModelPack,
  speechModelFileUrl,
  type SpeechModelPackDescriptor,
} from './speech-model-pack-registry';

export const SPEECH_MODEL_CACHE_NAME = 'llt-kokoro-models-v1';
/** Transformers.js browser cache — keep in sync so Kokoro can load offline after install. */
export const TRANSFORMERS_CACHE_NAME = 'transformers-cache';

let installAbort: AbortController | null = null;

async function putInCaches(url: string, buffer: ArrayBuffer): Promise<void> {
  const response = new Response(buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  const speechCache = await caches.open(SPEECH_MODEL_CACHE_NAME);
  const transformersCache = await caches.open(TRANSFORMERS_CACHE_NAME);
  await Promise.all([speechCache.put(url, response.clone()), transformersCache.put(url, response)]);
}

/**
 * Prefetch pinned Kokoro speech model files into Cache API.
 * Runs in the service worker / extension page — not in content scripts.
 */
export async function installSpeechModelPackFiles(
  packId: string,
  signal?: AbortSignal,
): Promise<void> {
  const pack = getSpeechModelPack(packId);
  if (!pack) {
    throw new Error(`Unknown speech model pack: ${packId}`);
  }

  installAbort = new AbortController();
  const onOuterAbort = () => installAbort?.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const combined = installAbort.signal;
    const speechCache = await caches.open(SPEECH_MODEL_CACHE_NAME);

    for (const file of pack.files) {
      const url = speechModelFileUrl(pack, file.path);
      const cached = await speechCache.match(url);
      if (cached) continue;

      const response = await fetch(url, {
        credentials: 'omit',
        signal: combined,
      });
      if (!response.ok) {
        throw new Error(`Failed to download ${file.path} (${response.status})`);
      }

      const buffer = await response.arrayBuffer();
      if (file.sizeBytes > 0 && buffer.byteLength === 0) {
        throw new Error(`Downloaded empty file for ${file.path}`);
      }

      await putInCaches(url, buffer);
    }
  } catch (err) {
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onOuterAbort);
    installAbort = null;
  }
}

export function cancelSpeechModelPackInstall(): void {
  installAbort?.abort();
}

export async function isSpeechModelPackCached(
  pack: SpeechModelPackDescriptor,
): Promise<boolean> {
  const cache = await caches.open(SPEECH_MODEL_CACHE_NAME);
  for (const file of pack.files) {
    const url = speechModelFileUrl(pack, file.path);
    if (!(await cache.match(url))) return false;
  }
  return true;
}
