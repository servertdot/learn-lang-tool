import { describe, expect, it } from 'vitest';
import { translationProviderPrivacyCopy } from './translation-provider-privacy';

describe('translationProviderPrivacyCopy', () => {
  it('discloses translation and pronunciation as separate unofficial Google transfers', () => {
    const copy = translationProviderPrivacyCopy('google');

    expect(copy).toContain('selected text');
    expect(copy).toContain('visible original or translated text');
    expect(copy).toContain('unofficial translation endpoint');
    expect(copy).toContain('unofficial TTS endpoint');
  });

  it('states that Bergamot mode never invokes Google TTS', () => {
    expect(translationProviderPrivacyCopy('bergamot')).toContain(
      'Bergamot mode never invokes Google TTS',
    );
  });
});
