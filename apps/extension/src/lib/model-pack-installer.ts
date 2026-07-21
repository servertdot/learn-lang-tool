import { BERGAMOT_REGISTRY_URL } from './model-pack-registry';

const MODEL_BASE_URL = 'https://storage.googleapis.com/bergamot-models-sandbox/0.3.3/';
export const MODEL_CACHE_NAME = 'llt-bergamot-models-v1';

type RegistryFile = {
  name: string;
  expectedSha256Hash?: string;
  estimatedCompressedSize?: number;
  size?: number;
};

type Registry = Record<string, Record<string, RegistryFile | undefined>>;

let installAbort: AbortController | null = null;

/**
 * Prefetch Bergamot model files into Cache API.
 * Runs in the service worker / extension page — no offscreen required.
 */
export async function installModelPackFiles(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<void> {
  installAbort = new AbortController();
  const onOuterAbort = () => installAbort?.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const combined = installAbort.signal;
    const registryResponse = await fetch(BERGAMOT_REGISTRY_URL, {
      credentials: 'omit',
      signal: combined,
    });
    if (!registryResponse.ok) {
      throw new Error(`Failed to fetch model registry (${registryResponse.status})`);
    }

    const registry = (await registryResponse.json()) as Registry;
    const key = `${from}${to}`;
    const files = registry[key];
    if (!files) {
      throw new Error(`No model files for ${from}→${to}`);
    }

    const cache = await caches.open(MODEL_CACHE_NAME);

    await Promise.all(
      Object.values(files).map(async file => {
        if (!file?.name) return;

        const url = `${MODEL_BASE_URL}${file.name}`;
        const cached = await cache.match(url);
        if (cached) return;

        const response = await fetch(url, {
          credentials: 'omit',
          signal: combined,
          // Skip integrity: GCS may serve compressed bodies that fail SRI checks in SW.
        });

        if (!response.ok) {
          throw new Error(`Failed to download ${file.name} (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        await cache.put(
          url,
          new Response(buffer, {
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
        );
      }),
    );
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

export function cancelModelPackInstall(): void {
  installAbort?.abort();
}
