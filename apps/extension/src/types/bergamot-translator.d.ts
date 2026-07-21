declare module '@browsermt/bergamot-translator/translator.js' {
  export class SupersededError extends Error {}
  export class CancelledError extends Error {}

  export class TranslatorBacking {
    options: Record<string, unknown>;
    registryUrl: string;
    downloadTimeout: number;
    registry: Promise<unknown>;
    buffers: Map<string, Promise<unknown>>;
    pivotLanguage: string | null;
    onerror: (err: Error) => void;
    constructor(options?: Record<string, unknown>);
    loadWorker(): Promise<{ worker: Worker; exports: unknown }>;
    loadModelRegistery(): Promise<Array<{ from: string; to: string; files: Record<string, { name: string; expectedSha256Hash: string }> }>>;
    getTranslationModel(
      pair: { from: string; to: string },
      options?: { signal?: AbortSignal },
    ): Promise<unknown>;
    loadTranslationModel(
      pair: { from: string; to: string },
      options?: { signal?: AbortSignal },
    ): Promise<unknown>;
    fetch(url: string, checksum?: string, extra?: { signal?: AbortSignal }): Promise<ArrayBuffer>;
  }

  export class LatencyOptimisedTranslator {
    backing: TranslatorBacking;
    /** Resolves when the WASM worker has finished initialize(). */
    worker: Promise<{ worker: Worker; exports: unknown; idle: boolean }>;
    constructor(options?: Record<string, unknown>, backing?: TranslatorBacking);
    translate(
      request: { from: string; to: string; text: string; html?: boolean },
      options?: { signal?: AbortSignal },
    ): Promise<{ target: { text: string }; request: unknown }>;
    delete(): Promise<void>;
  }

  export class BatchTranslator {
    constructor(options?: Record<string, unknown>, backing?: TranslatorBacking);
  }
}
