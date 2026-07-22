/** Stable failure categories at the TTS provider boundary. */
export type TtsErrorCode =
  | 'model_pack_missing'
  | 'model_pack_invalid'
  | 'language_unsupported'
  | 'request_cancelled'
  | 'generation_timed_out'
  | 'generation_failed'
  | 'artifact_encoding_failed'
  | 'artifact_storage_failed';

export class TtsError extends Error {
  constructor(
    public readonly code: TtsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}

/**
 * Provider-neutral description of what should be synthesized.
 * Queue entries retain this so artifacts can be recreated without storing bytes.
 */
export interface PronunciationRequest {
  text: string;
  language: string;
  providerId: string;
  providerRevision: string;
  voiceId: string;
  speed: number;
  encodingVersion: number;
}

/** Encoded audio plus metadata returned by a TTS provider. */
export interface PronunciationArtifact {
  artifactKey: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  sampleRate: number;
  language: string;
  voiceId: string;
  speed: number;
}

export interface AudioTtsProvider {
  readonly id: string;
  readonly revision: string;
  supportsLanguage(language: string): boolean;
  requiredModelPackIds(language: string): string[];
  synthesize(
    request: PronunciationRequest,
    signal?: AbortSignal,
  ): Promise<PronunciationArtifact>;
}

export const PRONUNCIATION_ENCODING_VERSION = 2;
export const DEFAULT_PRONUNCIATION_SPEED = 1;

function normalizeLanguageTag(language: string): string {
  return language.trim().toLowerCase().split(/[_-]/)[0] ?? language;
}

/** Hex digest of UTF-8 bytes via Web Crypto (SHA-256). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic artifact key from the pronunciation request.
 * Does not include the raw source text in the resulting filename.
 */
export async function computeArtifactIdentity(
  request: PronunciationRequest,
): Promise<{ artifactKey: string; filename: string }> {
  const material = [
    request.text.normalize('NFC'),
    normalizeLanguageTag(request.language),
    request.providerId,
    request.providerRevision,
    request.voiceId,
    String(request.speed),
    String(request.encodingVersion),
  ].join('\0');

  const hash = await sha256Hex(material);
  const artifactKey = `pron:${hash}`;
  const filename = `llt_${hash.slice(0, 24)}.mp3`;
  return { artifactKey, filename };
}

export function normalizePronunciationLanguage(language: string): string {
  return normalizeLanguageTag(language);
}
