import {
  DEFAULT_PRONUNCIATION_SPEED,
  normalizePronunciationLanguage,
  PRONUNCIATION_ENCODING_VERSION,
  TtsError,
  type PronunciationRequest,
} from './audio-tts-provider';
import {
  getSpeechModelPacksForLanguage,
  type SpeechModelPackDescriptor,
} from './speech-model-pack-registry';

export interface TtsProviderLanguageConfig {
  providerId: string;
  providerRevision: string;
  language: string;
  /** Whether this language is enabled for synthesis in the current release. */
  enabled: boolean;
  defaultVoiceId: string;
  defaultSpeed: number;
  speechModelPackId: string;
}

/**
 * Provider-language registry. Selection is keyed by source language, not by
 * translation language pair.
 */
export const TTS_PROVIDER_LANGUAGE_REGISTRY: readonly TtsProviderLanguageConfig[] = [
  {
    providerId: 'kokoro',
    providerRevision: 'v1.0',
    language: 'en',
    enabled: true,
    defaultVoiceId: 'af_heart',
    defaultSpeed: DEFAULT_PRONUNCIATION_SPEED,
    speechModelPackId: 'kokoro-en-v1.0',
  },
  {
    providerId: 'kokoro',
    providerRevision: 'v1.0',
    language: 'es',
    // Spanish voices exist upstream but are not enabled until phonemizer validation.
    enabled: false,
    defaultVoiceId: 'ef_dora',
    defaultSpeed: DEFAULT_PRONUNCIATION_SPEED,
    speechModelPackId: 'kokoro-en-v1.0',
  },
];

export function resolveTtsLanguageConfig(
  language: string,
): TtsProviderLanguageConfig | null {
  const normalized = normalizePronunciationLanguage(language);
  return (
    TTS_PROVIDER_LANGUAGE_REGISTRY.find(
      entry => entry.language === normalized && entry.enabled,
    ) ?? null
  );
}

export function buildPronunciationRequest(input: {
  text: string;
  language: string;
}): PronunciationRequest {
  const config = resolveTtsLanguageConfig(input.language);
  if (!config) {
    throw new TtsError(
      'language_unsupported',
      `No speech provider is configured for language “${input.language}”.`,
    );
  }

  return {
    text: input.text,
    language: config.language,
    providerId: config.providerId,
    providerRevision: config.providerRevision,
    voiceId: config.defaultVoiceId,
    speed: config.defaultSpeed,
    encodingVersion: PRONUNCIATION_ENCODING_VERSION,
  };
}

export function requiredSpeechModelPack(
  language: string,
): SpeechModelPackDescriptor | null {
  const config = resolveTtsLanguageConfig(language);
  if (!config) return null;
  return getSpeechModelPacksForLanguage(config.language)[0] ?? null;
}
