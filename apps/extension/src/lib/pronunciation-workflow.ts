import type { TranslateResponse } from '@package/shared';
import {
  computeArtifactIdentity,
  TtsError,
  type AudioTtsProvider,
  type PronunciationArtifact,
  type PronunciationRequest,
} from './audio-tts-provider';
import type { AnkiQueue } from './anki-queue';
import type { PronunciationArtifactStore } from './pronunciation-artifact-store';
import { buildPronunciationRequest, requiredSpeechModelPack } from './tts-provider-registry';
import type { ModelPackStatus } from './model-pack-store';

export type PronunciationUiState =
  | 'pack_missing'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'stopped'
  | 'failed'
  | 'unsupported';

export interface PronunciationSessionState {
  requestId: string;
  uiState: PronunciationUiState;
  pronunciationRequest?: PronunciationRequest;
  artifactKey?: string;
  errorCode?: string;
  errorMessage?: string;
  speechModelPackId?: string;
  approxSizeBytes?: number;
}

export interface PronunciationWorkflowDependencies {
  ttsProvider: AudioTtsProvider;
  artifactStore: PronunciationArtifactStore;
  getSpeechPackStatus(packId: string): Promise<ModelPackStatus>;
  synthesize?(
    request: PronunciationRequest,
    signal?: AbortSignal,
  ): Promise<PronunciationArtifact>;
}

/**
 * High-level pronunciation preparation for a translation result.
 * Stale completions for a superseded requestId are ignored by the caller.
 */
export async function preparePronunciationForResult(
  result: TranslateResponse,
  requestId: string,
  dependencies: PronunciationWorkflowDependencies,
  signal?: AbortSignal,
): Promise<PronunciationSessionState> {
  let pronunciationRequest: PronunciationRequest;
  try {
    pronunciationRequest = buildPronunciationRequest({
      text: result.source_text,
      language: result.from_code,
    });
  } catch (error) {
    if (error instanceof TtsError && error.code === 'language_unsupported') {
      return {
        requestId,
        uiState: 'unsupported',
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
    throw error;
  }

  const pack = requiredSpeechModelPack(pronunciationRequest.language);
  if (!pack) {
    return {
      requestId,
      uiState: 'unsupported',
      pronunciationRequest,
      errorCode: 'language_unsupported',
      errorMessage: 'No speech model pack is configured for this language.',
    };
  }

  const packStatus = await dependencies.getSpeechPackStatus(pack.id);
  if (packStatus !== 'ready') {
    return {
      requestId,
      uiState: 'pack_missing',
      pronunciationRequest,
      speechModelPackId: pack.id,
      approxSizeBytes: pack.approxSizeBytes,
    };
  }

  const { artifactKey, filename } = await computeArtifactIdentity(pronunciationRequest);
  const existing = await dependencies.artifactStore.get(artifactKey);
  if (existing) {
    await dependencies.artifactStore.touch(artifactKey);
    return {
      requestId,
      uiState: 'ready',
      pronunciationRequest,
      artifactKey,
      speechModelPackId: pack.id,
    };
  }

  if (signal?.aborted) {
    throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
  }

  const synthesize = dependencies.synthesize ?? ((req, sig) => dependencies.ttsProvider.synthesize(req, sig));

  try {
    const artifact = await synthesize(pronunciationRequest, signal);
    const stored: PronunciationArtifact = {
      ...artifact,
      artifactKey,
      filename: artifact.filename || filename,
    };
    await dependencies.artifactStore.put(stored);
    return {
      requestId,
      uiState: 'ready',
      pronunciationRequest,
      artifactKey,
      speechModelPackId: pack.id,
    };
  } catch (error) {
    if (error instanceof TtsError) {
      return {
        requestId,
        uiState: 'failed',
        pronunciationRequest,
        speechModelPackId: pack.id,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
    const message = error instanceof Error ? error.message : 'Speech generation failed.';
    return {
      requestId,
      uiState: 'failed',
      pronunciationRequest,
      speechModelPackId: pack.id,
      errorCode: 'generation_failed',
      errorMessage: message,
    };
  }
}

export interface EnqueueCardWithAudioInput {
  note: Parameters<AnkiQueue['enqueue']>[0];
  pronunciationRequest: PronunciationRequest;
  artifactKey?: string;
}

/**
 * Queue-first add: persists the note and pronunciation request, then the caller
 * may continue preparation / sync. Never silently omits required audio.
 */
export async function enqueueCardWithRequiredAudio(
  queue: AnkiQueue,
  input: EnqueueCardWithAudioInput,
  artifactStore?: PronunciationArtifactStore,
): Promise<{ itemId: string; audioStatus: string }> {
  if (input.artifactKey && artifactStore) {
    await artifactStore.pin(input.artifactKey);
  }

  const item = await queue.enqueue(input.note, {
    pronunciationRequest: input.pronunciationRequest,
    artifactKey: input.artifactKey,
    audioStatus: input.artifactKey ? 'ready_to_sync' : 'waiting_for_audio',
  });

  return { itemId: item.id, audioStatus: item.audioStatus ?? 'waiting_for_audio' };
}

/**
 * Resume audio generation for queued cards that are waiting for pronunciation.
 */
export async function fulfillQueuedPronunciation(
  queue: AnkiQueue,
  dependencies: PronunciationWorkflowDependencies,
  signal?: AbortSignal,
): Promise<void> {
  const items = await queue.list();
  for (const item of items) {
    if (
      (item.audioStatus !== 'waiting_for_audio' && item.audioStatus !== 'audio_failed') ||
      !item.pronunciationRequest
    ) {
      continue;
    }

    const { artifactKey, filename } = await computeArtifactIdentity(item.pronunciationRequest);
    const existing = await dependencies.artifactStore.get(artifactKey);
    if (existing) {
      await dependencies.artifactStore.pin(artifactKey);
      await queue.setAudioReady(item.id, artifactKey);
      continue;
    }

    const synthesize =
      dependencies.synthesize ?? ((req, sig) => dependencies.ttsProvider.synthesize(req, sig));

    try {
      const artifact = await synthesize(item.pronunciationRequest, signal);
      await dependencies.artifactStore.put(
        { ...artifact, artifactKey, filename: artifact.filename || filename },
        { pinned: true },
      );
      await queue.setAudioReady(item.id, artifactKey);
    } catch (error) {
      const message =
        error instanceof TtsError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Speech generation failed.';
      await queue.setAudioFailed(item.id, message);
    }
  }
}
