import { describe, it, expect } from 'vitest';
import {
  getModelPackForLanguagePair,
  formatApproxSize,
  MODEL_PACK_REGISTRY,
} from './model-pack-registry';

describe('model pack registry', () => {
  it('resolves en→ru model pack', () => {
    const pack = getModelPackForLanguagePair({ from_code: 'en', to_code: 'ru' });
    expect(pack?.id).toBe('en-ru');
    expect(pack?.from_code).toBe('en');
    expect(pack?.to_code).toBe('ru');
    expect(pack?.approxSizeBytes).toBeGreaterThan(0);
  });

  it('returns null for unsupported pairs', () => {
    expect(getModelPackForLanguagePair({ from_code: 'en', to_code: 'es' })).toBeNull();
  });

  it('lists registry entries without changing request/result shape assumptions', () => {
    expect(MODEL_PACK_REGISTRY.length).toBeGreaterThanOrEqual(1);
    for (const pack of MODEL_PACK_REGISTRY) {
      expect(pack.id).toMatch(/^[a-z]{2}-[a-z]{2}$/);
    }
  });

  it('formats approximate download size for consent UI', () => {
    expect(formatApproxSize(40 * 1024 * 1024)).toMatch(/MB/);
  });
});
