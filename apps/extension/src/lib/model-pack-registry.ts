import type { LanguagePair } from '@package/shared';

export interface ModelPackDescriptor {
  id: string;
  from_code: string;
  to_code: string;
  /** Approximate download size shown before consent. */
  approxSizeBytes: number;
  /** Bergamot / Firefox Translations model pair key (from→to). */
  bergamotPair: string;
}

/**
 * Registry of downloadable model packs. Adding a pack later should not change
 * Translation request/result shapes — only this registry grows.
 */
export const MODEL_PACK_REGISTRY: readonly ModelPackDescriptor[] = [
  {
    id: 'en-ru',
    from_code: 'en',
    to_code: 'ru',
    // Sum of estimatedCompressedSize for enru in Bergamot registry 0.3.3.
    approxSizeBytes: 15 * 1024 * 1024,
    bergamotPair: 'enru',
  },
];

/** Firefox Translations / Bergamot model registry used for downloads. */
export const BERGAMOT_REGISTRY_URL =
  'https://storage.googleapis.com/bergamot-models-sandbox/0.3.3/registry.json';

export function getModelPackForLanguagePair(pair: LanguagePair): ModelPackDescriptor | null {
  return (
    MODEL_PACK_REGISTRY.find(
      pack => pack.from_code === pair.from_code && pack.to_code === pair.to_code,
    ) ?? null
  );
}

export function formatApproxSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `~${Math.round(mb)} MB`;
  }
  const kb = bytes / 1024;
  return `~${Math.round(kb)} KB`;
}
