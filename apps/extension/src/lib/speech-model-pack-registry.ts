import { formatApproxSize } from './model-pack-registry';

export interface SpeechModelPackFile {
  /** Path relative to the Hugging Face model root, e.g. `onnx/model_quantized.onnx`. */
  path: string;
  /** Expected size in bytes from the pinned revision (for consent UI + integrity). */
  sizeBytes: number;
  /** Optional SHA-256 hex of the file contents. */
  sha256?: string;
}

export interface SpeechModelPackDescriptor {
  id: string;
  providerId: string;
  providerRevision: string;
  /** Languages this pack can synthesize after install. */
  languages: readonly string[];
  displayName: string;
  /** Approximate total download size shown before consent (from pinned manifest). */
  approxSizeBytes: number;
  /** Hugging Face model id hosting the ONNX conversion. */
  huggingfaceModelId: string;
  /** Pinned git revision / commit on the model repo. */
  huggingfaceRevision: string;
  files: readonly SpeechModelPackFile[];
}

/**
 * Kokoro 82M v1.0 ONNX (quantized) — English first.
 * Revision pinned to the onnx-community conversion tree snapshot used for sizing.
 */
export const KOKORO_EN_SPEECH_PACK: SpeechModelPackDescriptor = {
  id: 'kokoro-en-v1.0',
  providerId: 'kokoro',
  providerRevision: 'v1.0',
  languages: ['en'],
  displayName: 'Kokoro English speech',
  approxSizeBytes: 92_365_000,
  huggingfaceModelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  huggingfaceRevision: 'main',
  files: [
    { path: 'config.json', sizeBytes: 44 },
    { path: 'tokenizer.json', sizeBytes: 3497 },
    { path: 'tokenizer_config.json', sizeBytes: 113 },
    // Voice embeddings ship inside the kokoro-js package; only model weights are downloaded.
    { path: 'onnx/model_quantized.onnx', sizeBytes: 92_361_116 },
  ],
};

export const SPEECH_MODEL_PACK_REGISTRY: readonly SpeechModelPackDescriptor[] = [
  KOKORO_EN_SPEECH_PACK,
];

export function getSpeechModelPack(id: string): SpeechModelPackDescriptor | null {
  return SPEECH_MODEL_PACK_REGISTRY.find(pack => pack.id === id) ?? null;
}

export function getSpeechModelPacksForLanguage(
  language: string,
): SpeechModelPackDescriptor[] {
  const normalized = language.trim().toLowerCase().split(/[_-]/)[0] ?? language;
  return SPEECH_MODEL_PACK_REGISTRY.filter(pack => pack.languages.includes(normalized));
}

export function speechModelFileUrl(pack: SpeechModelPackDescriptor, path: string): string {
  return `https://huggingface.co/${pack.huggingfaceModelId}/resolve/${pack.huggingfaceRevision}/${path}`;
}

export { formatApproxSize };
