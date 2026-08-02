import {
  computeArtifactIdentity,
  DEFAULT_PRONUNCIATION_SPEED,
  PRONUNCIATION_ENCODING_VERSION,
  TtsError,
  type AudioTtsProvider,
  type PronunciationArtifact,
  type PronunciationRequest,
} from './audio-tts-provider';
import { encodeMonoMp3, MP3_SAMPLE_RATE_HZ } from './mp3-audio-encoder';

const GOOGLE_TRANSLATE_TTS_URL = 'https://translate.google.com/translate_tts';
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const SENTENCE_END = /[.!?\u3002\uFF01\uFF1F]/u;
const EXPECTED_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3']);
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CHUNK_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

export const GOOGLE_TRANSLATE_TTS_PROVIDER_ID = 'google-translate-web';
/** Changes whenever the endpoint request or decoded-MP3 assembly contract changes. */
export const GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION = 'translate-tts-v1-mp3-assembly-v1';
/** Conservative request-contract limit; release smoke checks must revalidate it. */
export const GOOGLE_TRANSLATE_TTS_MAX_CHARS = 200;

export interface GoogleTranslateTtsAssemblyResult {
  bytes: Uint8Array;
  sampleRate: number;
}

export interface GoogleTranslateTtsProviderOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  operationTimeoutMs?: number;
  maxCharsPerRequest?: number;
  maxChunkResponseBytes?: number;
  maxArtifactBytes?: number;
  assembleAudio?(
    chunks: readonly Uint8Array[],
    signal: AbortSignal,
  ): Promise<GoogleTranslateTtsAssemblyResult>;
}

function normalizeGoogleSpeechLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().replaceAll('_', '-');
  if (!LANGUAGE_CODE_PATTERN.test(normalized)) {
    throw new TtsError('language_unsupported', 'Google speech language is invalid.');
  }
  return normalized;
}

export function buildGoogleTranslatePronunciationRequest(input: {
  text: string;
  language: string;
}): PronunciationRequest {
  const language = normalizeGoogleSpeechLanguage(input.language);
  return {
    text: input.text,
    language,
    providerId: GOOGLE_TRANSLATE_TTS_PROVIDER_ID,
    providerRevision: GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION,
    voiceId: `${GOOGLE_TRANSLATE_TTS_PROVIDER_ID}:${language}`,
    speed: DEFAULT_PRONUNCIATION_SPEED,
    encodingVersion: PRONUNCIATION_ENCODING_VERSION,
  };
}

function lastNaturalBoundary(chars: readonly string[]): number {
  let sentenceBoundary = 0;
  let wordBoundary = 0;

  for (let index = 0; index < chars.length; index += 1) {
    if (/\s/u.test(chars[index] ?? '')) {
      wordBoundary = index + 1;
      if (index > 0 && SENTENCE_END.test(chars[index - 1] ?? '')) {
        sentenceBoundary = index + 1;
      }
    }
    if (SENTENCE_END.test(chars[index] ?? '')) {
      sentenceBoundary = index + 1;
    }
  }

  return sentenceBoundary || wordBoundary || chars.length;
}

/** Split without changing text, order, punctuation, whitespace, or Unicode code points. */
export function splitGoogleTranslateTtsText(
  text: string,
  maxChars = GOOGLE_TRANSLATE_TTS_MAX_CHARS,
): string[] {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) {
    throw new TtsError('generation_failed', 'Google speech chunk limit is invalid.');
  }
  if (!text) {
    throw new TtsError('generation_failed', 'Pronunciation text is empty.');
  }

  const remaining = Array.from(text);
  const chunks: string[] = [];
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining.join(''));
      break;
    }

    const boundary = lastNaturalBoundary(remaining.slice(0, maxChars));
    chunks.push(remaining.splice(0, boundary).join(''));
  }
  return chunks;
}

function buildChunkUrl(chunk: string, language: string, index: number, total: number): string {
  const url = new URL(GOOGLE_TRANSLATE_TTS_URL);
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', language);
  url.searchParams.set('q', chunk);
  url.searchParams.set('textlen', String(Array.from(chunk).length));
  url.searchParams.set('idx', String(index));
  url.searchParams.set('total', String(total));
  return url.toString();
}

async function readBoundedAudio(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new TtsError('generation_failed', 'Google speech response exceeded the size limit.');
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new TtsError('generation_failed', 'Google speech response exceeded the size limit.');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new TtsError('generation_failed', 'Google speech response exceeded the size limit.');
      }
      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancelledError(): TtsError {
  return new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
}

async function fetchChunk(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal,
  timeoutMs: number,
  maxBytes: number,
): Promise<Uint8Array> {
  if (signal.aborted) throw cancelledError();
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Timed out', 'AbortError'));
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok || response.redirected) {
      throw new TtsError('generation_failed', 'Google speech request was rejected.');
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!mimeType || !EXPECTED_AUDIO_MIME_TYPES.has(mimeType)) {
      throw new TtsError('generation_failed', 'Google speech returned invalid audio data.');
    }
    const bytes = await readBoundedAudio(response, maxBytes);
    if (bytes.byteLength === 0) {
      throw new TtsError('generation_failed', 'Google speech returned empty audio data.');
    }
    return bytes;
  } catch (error) {
    if (signal.aborted) throw cancelledError();
    if (timedOut) {
      throw new TtsError('generation_timed_out', 'Google speech request timed out.');
    }
    if (error instanceof TtsError) throw error;
    throw new TtsError('generation_failed', 'Could not reach Google speech.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', forwardAbort);
  }
}

async function decodeToMono(bytes: Uint8Array, context: AudioContext): Promise<Float32Array> {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const decoded = await context.decodeAudioData(buffer);
  if (decoded.length === 0 || decoded.numberOfChannels === 0) {
    throw new Error('Decoded audio was empty.');
  }
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const samples = decoded.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      mono[index] = (mono[index] ?? 0) + (samples[index] ?? 0) / decoded.numberOfChannels;
    }
  }
  return mono;
}

/** Decode every endpoint chunk and re-encode one validated MP3 artifact. */
export async function assembleGoogleTranslateTtsAudio(
  chunks: readonly Uint8Array[],
  signal: AbortSignal,
): Promise<GoogleTranslateTtsAssemblyResult> {
  if (signal.aborted) throw cancelledError();
  const context = new AudioContext({ sampleRate: MP3_SAMPLE_RATE_HZ });
  try {
    const decoded: Float32Array[] = [];
    for (const chunk of chunks) {
      if (signal.aborted) throw cancelledError();
      decoded.push(await decodeToMono(chunk, context));
    }
    const totalSamples = decoded.reduce((sum, samples) => sum + samples.length, 0);
    const combined = new Float32Array(totalSamples);
    let offset = 0;
    for (const samples of decoded) {
      combined.set(samples, offset);
      offset += samples.length;
    }
    if (signal.aborted) throw cancelledError();
    const bytes = await encodeMonoMp3(combined, context.sampleRate);
    if (bytes.byteLength === 0) throw new Error('Encoded audio was empty.');
    return { bytes, sampleRate: MP3_SAMPLE_RATE_HZ };
  } finally {
    await context.close();
  }
}

export function createGoogleTranslateTtsProvider(
  options: GoogleTranslateTtsProviderOptions = {},
): AudioTtsProvider {
  const fetchImpl = options.fetch ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  const maxChars = options.maxCharsPerRequest ?? GOOGLE_TRANSLATE_TTS_MAX_CHARS;
  const maxChunkBytes = options.maxChunkResponseBytes ?? DEFAULT_MAX_CHUNK_RESPONSE_BYTES;
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const assembleAudio = options.assembleAudio ?? assembleGoogleTranslateTtsAudio;

  return {
    id: GOOGLE_TRANSLATE_TTS_PROVIDER_ID,
    revision: GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION,
    supportsLanguage(language) {
      try {
        normalizeGoogleSpeechLanguage(language);
        return true;
      } catch {
        return false;
      }
    },
    requiredModelPackIds: () => [],
    async synthesize(request, callerSignal): Promise<PronunciationArtifact> {
      if (
        request.providerId !== GOOGLE_TRANSLATE_TTS_PROVIDER_ID ||
        request.providerRevision !== GOOGLE_TRANSLATE_TTS_PROVIDER_REVISION
      ) {
        throw new TtsError('generation_failed', 'Google speech request revision is unsupported.');
      }

      const language = normalizeGoogleSpeechLanguage(request.language);
      const controller = new AbortController();
      let operationTimedOut = false;
      const forwardAbort = () => controller.abort(callerSignal?.reason);
      callerSignal?.addEventListener('abort', forwardAbort, { once: true });
      const deadline = setTimeout(() => {
        operationTimedOut = true;
        controller.abort(new DOMException('Timed out', 'AbortError'));
      }, operationTimeoutMs);

      try {
        const textChunks = splitGoogleTranslateTtsText(request.text, maxChars);
        const audioChunks: Uint8Array[] = [];
        let receivedBytes = 0;
        for (let index = 0; index < textChunks.length; index += 1) {
          const audio = await fetchChunk(
            fetchImpl,
            buildChunkUrl(textChunks[index] ?? '', language, index, textChunks.length),
            controller.signal,
            requestTimeoutMs,
            maxChunkBytes,
          );
          receivedBytes += audio.byteLength;
          if (receivedBytes > maxArtifactBytes) {
            throw new TtsError('generation_failed', 'Google speech artifact exceeded the size limit.');
          }
          audioChunks.push(audio);
        }

        let assembled: GoogleTranslateTtsAssemblyResult;
        try {
          assembled = await assembleAudio(audioChunks, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) {
            if (callerSignal?.aborted) throw cancelledError();
            throw new TtsError('generation_timed_out', 'Google speech assembly timed out.');
          }
          if (error instanceof TtsError) throw error;
          throw new TtsError('artifact_encoding_failed', 'Google speech audio was invalid.');
        }
        if (assembled.bytes.byteLength === 0 || assembled.bytes.byteLength > maxArtifactBytes) {
          throw new TtsError('artifact_encoding_failed', 'Google speech audio was invalid.');
        }

        const identity = await computeArtifactIdentity(request);
        return {
          ...identity,
          bytes: assembled.bytes,
          mimeType: 'audio/mpeg',
          extension: 'mp3',
          sampleRate: assembled.sampleRate,
          language,
          voiceId: request.voiceId,
          speed: request.speed,
        };
      } catch (error) {
        if (callerSignal?.aborted) throw cancelledError();
        if (operationTimedOut) {
          throw new TtsError('generation_timed_out', 'Google speech preparation timed out.');
        }
        if (error instanceof TtsError) throw error;
        throw new TtsError('generation_failed', 'Google speech generation failed.');
      } finally {
        clearTimeout(deadline);
        callerSignal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}
