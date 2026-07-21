import {
  LatencyOptimisedTranslator,
  TranslatorBacking,
  CancelledError,
} from '@browsermt/bergamot-translator/translator.js';
import { BERGAMOT_REGISTRY_URL, bergamotModelFileUrl } from './model-pack-registry';

import { MODEL_CACHE_NAME } from './model-pack-installer';

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

    const call = (name: string, ...args: unknown[]) =>
      new Promise((accept, reject) => {
        const id = ++serial;
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
        reject(
          Object.assign(new Error(), error, {
            message: `${error.message} (response to ${callsite.message})`,
            stack: error.stack ? `${error.stack}\n${callsite.stack}` : callsite.stack,
          }),
        );
      } else {
        accept(result);
      }
    });

    worker.addEventListener('error', event => {
      this.onerror(new Error(event.message || 'Bergamot worker error'));
    });

    await call('initialize', this.options);

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

  async fetch(url: string, checksum: string | undefined, extra?: { signal?: AbortSignal }) {
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
      return cached.arrayBuffer();
    }

    const buffer = await super.fetch(absolute, checksum, extra);
    await cache.put(absolute, new Response(buffer.slice(0), {
      headers: { 'Content-Type': 'application/octet-stream' },
    }));
    return buffer;
  }
}

let translatorPromise: Promise<LatencyOptimisedTranslator> | null = null;
let installAbort: AbortController | null = null;

function getTranslator(): Promise<LatencyOptimisedTranslator> {
  if (!translatorPromise) {
    const backing = new ExtensionBergamotBacking();
    translatorPromise = Promise.resolve(new LatencyOptimisedTranslator({}, backing));
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

export async function translateWithBergamot(
  text: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<string> {
  const translator = await getTranslator();
  const response = await translator.translate(
    { from, to, text, html: false },
    { signal },
  );
  return response.target.text as string;
}
