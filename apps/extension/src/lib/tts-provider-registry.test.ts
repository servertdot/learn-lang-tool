import { describe, expect, it } from 'vitest';
import { TtsError } from './audio-tts-provider';
import {
  buildPronunciationRequest,
  requiredSpeechModelPack,
  resolveTtsLanguageConfig,
} from './tts-provider-registry';

describe('tts provider language registry', () => {
  it('resolves English to the enabled Kokoro configuration', () => {
    expect(resolveTtsLanguageConfig('en-US')).toMatchObject({
      providerId: 'kokoro',
      language: 'en',
      enabled: true,
      defaultVoiceId: 'af_heart',
    });
  });

  it('treats Spanish as configured but disabled', () => {
    expect(resolveTtsLanguageConfig('es')).toBeNull();
  });

  it('rejects unsupported languages with a stable capability error', () => {
    expect(() => buildPronunciationRequest({ text: 'привет', language: 'ru' })).toThrow(
      TtsError,
    );
    try {
      buildPronunciationRequest({ text: 'привет', language: 'ru' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'language_unsupported' });
    }
  });

  it('builds a provider-neutral pronunciation request for English', () => {
    expect(buildPronunciationRequest({ text: 'hello', language: 'en' })).toEqual({
      text: 'hello',
      language: 'en',
      providerId: 'kokoro',
      providerRevision: 'v1.0',
      voiceId: 'af_heart',
      speed: 1,
      encodingVersion: 1,
    });
  });

  it('selects the Kokoro English speech model pack', () => {
    expect(requiredSpeechModelPack('en')?.id).toBe('kokoro-en-v1.0');
  });
});
