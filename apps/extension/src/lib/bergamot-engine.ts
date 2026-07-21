import {
  LatencyOptimisedTranslator,
  TranslatorBacking,
  CancelledError,
} from '@browsermt/bergamot-translator/translator.js';
import { BERGAMOT_REGISTRY_URL, bergamotModelFileUrl } from './model-pack-registry';

import { MODEL_CACHE_NAME } from './model-pack-installer';
import { lltError, lltLog } from './debug-log';

const CACHE_NAME = MODEL_CACHE_NAME;

/**
 * Bergamot backing for MV3: extension worker URLs + absolute model URLs + Cache API.
 */
export class ExtensionBergamotBacking extends TranslatorBacking {
  private currentPair: { from: string; to: string } | null = null;

  constructor(options: Record<string, unknown> = {}) {
    super({
      registryUrl: BERGAMOT_REGISTRY_URL,
      pivotLanguage: null,
      downloadTimeout: 120_000,
      onerror: (err: Error) => lltError('bergamot', 'backing onerror', err),
      ...options,
    });
  }

  getTranslationModel(
    pair: { from: string; to: string },
    options?: { signal?: AbortSignal },
  ) {
    this.currentPair = pair;
    return super.getTranslationModel(pair, options);
  }

  async loadWorker() {
    const workerUrl = chrome.runtime.getURL('bergamot/translator-worker.js');
    lltLog('bergamot', 'loadWorker', workerUrl);
    const worker = new Worker(workerUrl);

    let serial = 0;
    const pending = new Map<
      number,
      {
        accept: (v: unknown) => void;
        reject: (e: Error) => void;
        callsite: { message: string; stack?: string };
      }
    >();

    const rejectAll = (err: Error) => {
      for (const [, entry] of pending) {
        entry.reject(err);
      }
      pending.clear();
    };

    const call = (name: string, ...args: unknown[]) =>
      new Promise((accept, reject) => {
        const id = ++serial;
        lltLog('bergamot', 'worker call →', name, id);
        pending.set(id, {
          accept,
          reject,
          callsite: {
            message: `${name}(${args.map(String).join(', ')})`,
            stack: new Error().stack,
          },
        });
        worker.postMessage({ id, name, args });
      });

    worker.addEventListener('message', ({ data }: MessageEvent) => {
      const { id, result, error } = data as {
        id: number;
        result?: unknown;
        error?: { message: string; stack?: string };
      };
      if (!pending.has(id)) {
        return;
      }
      const { accept, reject, callsite } = pending.get(id)!;
      pending.delete(id);
      if (error !== undefined) {
        lltError('bergamot', 'worker error ←', id, error.message);
        reject(
          Object.assign(new Error(), error, {
            message: `${error.message} (response to ${callsite.message})`,
            stack: error.stack ? `${error.stack}\n${callsite.stack}` : callsite.stack,
          }),
        );
      } else {
        lltLog('bergamot', 'worker ok ←', id);
        accept(result);
      }
    });

    worker.addEventListener('error', event => {
      const err = new Error(event.message || 'Bergamot worker error');
      lltError('bergamot', 'worker event error', event.message, event.filename, event.lineno);
      rejectAll(err);
      this.onerror(err);
    });

    worker.addEventListener('messageerror', event => {
      const err = new Error('Bergamot worker messageerror (structured clone failed)');
      lltError('bergamot', 'worker messageerror', event);
      rejectAll(err);
      this.onerror(err);
    });

    await call('initialize', {
      cacheSize: 0,
      useNativeIntGemm: false,
    });
    lltLog('bergamot', 'worker initialized');

    return {
      worker,
      exports: new Proxy(
        {},
        {
          get(_target, name: string) {
            if (name !== 'then') {
              return (...args: unknown[]) => call(name, ...args);
            }
            return undefined;
          },
        },
      ),
    };
  }

  /**
   * Never use subresource integrity against GCS — compressed/encoded bodies
   * break SRI even when the model bytes are fine. Prefer Cache API.
   */
  async fetch(url: string, _checksum: string | undefined, extra?: { signal?: AbortSignal }) {
    let absolute = url;
    if (!url.startsWith('http')) {
      if (!this.currentPair) {
        throw new Error(`Cannot resolve model file URL without language pair: ${url}`);
      }
      absolute = bergamotModelFileUrl(
        `${this.currentPair.from}${this.currentPair.to}`,
        url,
      );
    }

    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(absolute);
    if (cached) {
      lltLog('bergamot', 'cache hit', absolute);
      return cached.arrayBuffer();
    }

    lltLog('bergamot', 'cache miss, downloading', absolute);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = setTimeout(onAbort, this.downloadTimeout || 120_000);
    extra?.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(absolute, {
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to download ${absolute} (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      await cache.put(
        absolute,
        new Response(buffer.slice(0), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
      return buffer;
    } finally {
      clearTimeout(timeout);
      extra?.signal?.removeEventListener('abort', onAbort);
    }
  }
}

let translatorPromise: Promise<LatencyOptimisedTranslator> | null = null;
let installAbort: AbortController | null = null;

/**
 * Create translator and wait until the WASM worker finishes initialize().
 * LatencyOptimisedTranslator otherwise swallows worker load failures in notify().
 */
function getTranslator(): Promise<LatencyOptimisedTranslator> {
  if (!translatorPromise) {
    translatorPromise = (async () => {
      const backing = new ExtensionBergamotBacking();
      const translator = new LatencyOptimisedTranslator({}, backing);
      lltLog('bergamot', 'waiting for worker…');
      await translator.worker;
      lltLog('bergamot', 'worker ready');
      return translator;
    })().catch(err => {
      translatorPromise = null;
      throw err;
    });
  }
  return translatorPromise;
}

/** Prefetch en→ru (or given) model files into Cache API. */
export async function installBergamotModelPack(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<void> {
  installAbort = new AbortController();
  const onOuterAbort = () => installAbort?.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const translator = await getTranslator();
    const backing = translator.backing as ExtensionBergamotBacking;
    await backing.getTranslationModel(
      { from, to },
      { signal: installAbort.signal },
    );
  } catch (err) {
    if (err instanceof CancelledError || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onOuterAbort);
    installAbort = null;
  }
}

export function cancelBergamotModelPackInstall(): void {
  installAbort?.abort();
}

/** Warm WASM worker as soon as the offscreen document loads. */
export async function warmBergamotEngine(): Promise<void> {
  await getTranslator();
}

export async function translateWithBergamot(
  text: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<string> {
  lltLog('bergamot', 'translateWithBergamot', { from, to, textLen: text.length });
  if (signal?.aborted) {
    throw new CancelledError('abort signal');
  }

  const translator = await getTranslator();
  const response = await translator.translate(
    { from, to, text, html: false },
    { signal },
  );
  const out = response.target.text as string;
  lltLog('bergamot', 'translateWithBergamot done', out.slice(0, 120));
  return out;
}
