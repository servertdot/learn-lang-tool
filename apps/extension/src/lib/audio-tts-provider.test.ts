import { describe, expect, it } from 'vitest';
import {
  computeArtifactIdentity,
  normalizePronunciationLanguage,
  PRONUNCIATION_ENCODING_VERSION,
  type PronunciationRequest,
} from './audio-tts-provider';

const baseRequest: PronunciationRequest = {
  text: 'hello',
  language: 'en',
  providerId: 'kokoro',
  providerRevision: 'v1.0',
  voiceId: 'af_heart',
  speed: 1,
  encodingVersion: PRONUNCIATION_ENCODING_VERSION,
};

describe('computeArtifactIdentity', () => {
  it('produces a stable key and safe filename without the source text', async () => {
    const first = await computeArtifactIdentity(baseRequest);
    const second = await computeArtifactIdentity(baseRequest);

    expect(first).toEqual(second);
    expect(first.artifactKey).toMatch(/^pron:[0-9a-f]{64}$/);
    expect(first.filename).toMatch(/^llt_[0-9a-f]{24}\.wav$/);
    expect(first.filename).not.toContain('hello');
  });

  it('changes identity when voice, speed, or text changes', async () => {
    const base = await computeArtifactIdentity(baseRequest);
    const voice = await computeArtifactIdentity({ ...baseRequest, voiceId: 'am_adam' });
    const speed = await computeArtifactIdentity({ ...baseRequest, speed: 1.2 });
    const text = await computeArtifactIdentity({ ...baseRequest, text: 'Hello' });

    expect(voice.artifactKey).not.toBe(base.artifactKey);
    expect(speed.artifactKey).not.toBe(base.artifactKey);
    expect(text.artifactKey).not.toBe(base.artifactKey);
  });
});

describe('normalizePronunciationLanguage', () => {
  it('normalizes BCP-47 tags to the primary language subtag', () => {
    expect(normalizePronunciationLanguage('en-US')).toBe('en');
    expect(normalizePronunciationLanguage('EN')).toBe('en');
  });
});
