import {
  computeArtifactIdentity,
  TtsError,
  type AudioTtsProvider,
  type PronunciationArtifact,
  type PronunciationRequest,
} from './audio-tts-provider';
import { encodeMonoMp3, MP3_SAMPLE_RATE_HZ } from './mp3-audio-encoder';
import { KOKORO_EN_SPEECH_PACK } from './speech-model-pack-registry';

const KOKORO_MODEL_ID = KOKORO_EN_SPEECH_PACK.huggingfaceModelId;

type KokoroModule = typeof import('kokoro-js');
type KokoroInstance = Awaited<ReturnType<KokoroModule['KokoroTTS']['from_pretrained']>>;

let kokoroPromise: Promise<KokoroInstance> | null = null;

export interface KokoroOrtEnv {
  wasmPaths: unknown;
}

export interface TransformersOrtWasmEnv {
  backends: {
    onnx?: {
      wasm?: {
        wasmPaths?: unknown;
        numThreads?: number;
        proxy?: boolean;
      };
    };
  };
}

/**
 * Point ONNX Runtime at extension-packaged WASM and disable thread-pool workers.
 * Threaded ORT workers run without `document` and throw in MV3 offscreen.
 * Transformers.js otherwise defaults to jsdelivr, which MV3 CSP blocks.
 */
export function configureKokoroOrtRuntime(
  kokoroEnv: KokoroOrtEnv,
  transformersEnv: TransformersOrtWasmEnv,
  getUrl: (path: string) => string = path => chrome.runtime.getURL(path),
): void {
  const wasmPaths = getUrl('ort/');
  kokoroEnv.wasmPaths = wasmPaths;
  const wasm = transformersEnv.backends.onnx?.wasm;
  if (!wasm) {
    throw new Error('Transformers.js ONNX WASM backend is unavailable.');
  }
  wasm.wasmPaths = wasmPaths;
  // onnxruntime-web thread workers have no DOM; single-thread avoids "document is not defined".
  wasm.numThreads = 1;
  wasm.proxy = false;
}

/** @deprecated Use configureKokoroOrtRuntime */
export function configureKokoroOrtWasmPaths(
  env: KokoroOrtEnv,
  getUrl: (path: string) => string = path => chrome.runtime.getURL(path),
): void {
  env.wasmPaths = getUrl('ort/');
}

async function loadKokoro(): Promise<KokoroInstance> {
  if (typeof document === 'undefined') {
    throw new TtsError(
      'generation_failed',
      'Kokoro speech synthesis must run in the offscreen document, not the service worker.',
    );
  }

  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      // Configure ORT before Kokoro constructs a session. Import transformers first so we
      // can disable thread-pool workers (they throw "document is not defined" in MV3).
      const { env: transformersEnv } = await import('@huggingface/transformers');
      const { KokoroTTS, env } = await import('kokoro-js');
      configureKokoroOrtRuntime(env, transformersEnv);
      return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
      });
    })().catch(error => {
      kokoroPromise = null;
      throw error;
    });
  }
  return kokoroPromise;
}

function asVoice(voiceId: string): 'af_heart' {
  return voiceId as 'af_heart';
}

/**
 * Kokoro-backed AudioTtsProvider. Loads ONNX weights via Transformers.js
 * (Cache API / installed speech model pack) and returns MP3 artifacts.
 */
export function createKokoroAudioTtsProvider(): AudioTtsProvider {
  return {
    id: 'kokoro',
    revision: KOKORO_EN_SPEECH_PACK.providerRevision,
    supportsLanguage(language) {
      const normalized = language.trim().toLowerCase().split(/[_-]/)[0];
      return normalized === 'en';
    },
    requiredModelPackIds(language) {
      return this.supportsLanguage(language) ? [KOKORO_EN_SPEECH_PACK.id] : [];
    },
    async synthesize(request, signal) {
      if (!this.supportsLanguage(request.language)) {
        throw new TtsError(
          'language_unsupported',
          `Kokoro does not support language “${request.language}”.`,
        );
      }
      if (signal?.aborted) {
        throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
      }

      let tts: KokoroInstance;
      try {
        tts = await loadKokoro();
      } catch (error) {
        if (signal?.aborted) {
          throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
        }
        if (error instanceof TtsError) throw error;
        const message = error instanceof Error ? error.message : 'Failed to load Kokoro model.';
        throw new TtsError('model_pack_invalid', message);
      }

      if (signal?.aborted) {
        throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
      }

      let rawAudio: { audio: Float32Array; sampling_rate: number };
      try {
        rawAudio = await tts.generate(request.text, {
          voice: asVoice(request.voiceId),
          speed: request.speed,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
        }
        const message = error instanceof Error ? error.message : 'Speech generation failed.';
        throw new TtsError('generation_failed', message);
      }

      let bytes: Uint8Array;
      try {
        bytes = await encodeMonoMp3(rawAudio.audio, rawAudio.sampling_rate);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'MP3 encoding failed.';
        throw new TtsError('artifact_encoding_failed', message);
      }

      const { artifactKey, filename } = await computeArtifactIdentity(request);
      const artifact: PronunciationArtifact = {
        artifactKey,
        filename,
        bytes,
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        sampleRate: MP3_SAMPLE_RATE_HZ,
        language: request.language,
        voiceId: request.voiceId,
        speed: request.speed,
      };
      return artifact;
    },
  };
}

/** Test helper: clear the cached Kokoro singleton between tests. */
export function resetKokoroAudioTtsProviderForTests(): void {
  kokoroPromise = null;
}

export type { PronunciationRequest };
