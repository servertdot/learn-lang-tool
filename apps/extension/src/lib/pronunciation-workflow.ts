import type { TranslationProvider } from '@package/shared';
import {
  computeArtifactIdentity,
  TtsError,
  type PronunciationArtifact,
  type PronunciationRequest,
} from './audio-tts-provider';
import type { AnkiQueue } from './anki-queue';
import type { ModelPackStatus } from './model-pack-store';
import type { PronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  buildPronunciationPolicy,
  requiredSpeechModelPackForRequest,
  type PronunciationPurpose,
} from './tts-provider-registry';

export type PronunciationUiState =
  | 'pack_missing'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'stopped'
  | 'failed'
  | 'unsupported';

export type PronunciationPlaybackKind = 'artifact' | 'web_speech';

export interface PronunciationSessionState {
  requestId: string;
  uiState: PronunciationUiState;
  pronunciationRequests?: PronunciationRequest[];
  /** Compatibility field for callers and legacy queue items that carry one request. */
  pronunciationRequest?: PronunciationRequest;
  artifactKey?: string;
  providerId?: string;
  playbackKind?: PronunciationPlaybackKind;
  errorCode?: string;
  errorMessage?: string;
  speechModelPackId?: string;
  approxSizeBytes?: number;
}

export interface PronunciationWorkflowInput {
  requestId: string;
  text: string;
  language: string;
  translationProvider: TranslationProvider;
  purpose: PronunciationPurpose;
  /** Preview retry cursor after a provider's playback-start failure. */
  excludedProviderIds?: readonly string[];
}

export interface PronunciationWorkflowDependencies {
  artifactStore: PronunciationArtifactStore;
  getSpeechPackStatus(packId: string): Promise<ModelPackStatus>;
  synthesize(
    request: PronunciationRequest,
    signal?: AbortSignal,
  ): Promise<PronunciationArtifact>;
  playArtifact?(artifactKey: string, signal: AbortSignal): Promise<void>;
  playWebSpeech?(text: string, language: string, signal: AbortSignal): Promise<void>;
}

function requestListState(
  input: PronunciationWorkflowInput,
  requests: readonly PronunciationRequest[],
): Pick<PronunciationSessionState, 'requestId' | 'pronunciationRequests' | 'pronunciationRequest'> {
  return {
    requestId: input.requestId,
    pronunciationRequests: requests.map(request => ({ ...request })),
    pronunciationRequest: requests[0] ? { ...requests[0] } : undefined,
  };
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof TtsError && error.code === 'request_cancelled') ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Pronunciation provider failed.';
}

/**
 * High-level pronunciation seam. It owns the authorized provider order,
 * whole-text fallback, model-pack eligibility, artifact reuse, and preview playback.
 */
export async function runPronunciationWorkflow(
  input: PronunciationWorkflowInput,
  dependencies: PronunciationWorkflowDependencies,
  signal?: AbortSignal,
): Promise<PronunciationSessionState> {
  let policy;
  try {
    policy = buildPronunciationPolicy(input);
  } catch (error) {
    return {
      requestId: input.requestId,
      uiState: 'unsupported',
      errorCode: error instanceof TtsError ? error.code : 'language_unsupported',
      errorMessage: failureMessage(error),
    };
  }

  const authorizedRequests = policy.pronunciationRequests;
  const excludedProviders = new Set(input.excludedProviderIds ?? []);
  const requests = authorizedRequests.filter(request => !excludedProviders.has(request.providerId));
  const stateBase = requestListState(input, authorizedRequests);
  const playbackSignal = signal ?? new AbortController().signal;
  let lastError: unknown;

  for (const request of requests) {
    if (signal?.aborted) {
      return {
        ...stateBase,
        uiState: 'stopped',
        errorCode: 'request_cancelled',
      };
    }

    const speechPack = requiredSpeechModelPackForRequest(request);
    if (speechPack) {
      const status = await dependencies.getSpeechPackStatus(speechPack.id);
      if (signal?.aborted) {
        return {
          ...stateBase,
          uiState: 'stopped',
          providerId: request.providerId,
          errorCode: 'request_cancelled',
        };
      }
      if (status !== 'ready') {
        if (input.purpose === 'anki') {
          return {
            ...stateBase,
            uiState: 'pack_missing',
            providerId: request.providerId,
            speechModelPackId: speechPack.id,
            approxSizeBytes: speechPack.approxSizeBytes,
            errorCode: 'model_pack_missing',
            errorMessage: 'A compatible speech model pack is required for Anki audio.',
          };
        }
        continue;
      }
    }

    const identity = await computeArtifactIdentity(request);
    try {
      if (signal?.aborted) throw new TtsError('request_cancelled', 'Pronunciation was stopped.');
      let artifactKey = identity.artifactKey;
      const existing = await dependencies.artifactStore.get(artifactKey);
      if (signal?.aborted) throw new TtsError('request_cancelled', 'Pronunciation was stopped.');
      if (existing) {
        await dependencies.artifactStore.touch(artifactKey);
      } else {
        const artifact = await dependencies.synthesize(request, signal);
        const stored: PronunciationArtifact = {
          ...artifact,
          artifactKey,
          filename: artifact.filename || identity.filename,
        };
        await dependencies.artifactStore.put(stored);
        artifactKey = stored.artifactKey;
      }

      if (input.purpose === 'preview' && dependencies.playArtifact) {
        await dependencies.playArtifact(artifactKey, playbackSignal);
        return {
          ...stateBase,
          uiState: 'stopped',
          artifactKey,
          providerId: request.providerId,
          playbackKind: 'artifact',
        };
      }

      return {
        ...stateBase,
        uiState: 'ready',
        artifactKey,
        providerId: request.providerId,
        playbackKind: 'artifact',
        speechModelPackId: speechPack?.id,
      };
    } catch (error) {
      if (isCancellation(error, signal)) {
        return {
          ...stateBase,
          uiState: 'stopped',
          providerId: request.providerId,
          errorCode: 'request_cancelled',
          errorMessage: 'Pronunciation was stopped.',
        };
      }
      lastError = error;
    }
  }

  if (policy.allowWebSpeech) {
    try {
      if (dependencies.playWebSpeech) {
        await dependencies.playWebSpeech(input.text, input.language, playbackSignal);
        return {
          ...stateBase,
          uiState: 'stopped',
          providerId: 'web-speech',
          playbackKind: 'web_speech',
        };
      }
      return {
        ...stateBase,
        uiState: 'ready',
        providerId: 'web-speech',
        playbackKind: 'web_speech',
      };
    } catch (error) {
      if (isCancellation(error, signal)) {
        return {
          ...stateBase,
          uiState: 'stopped',
          providerId: 'web-speech',
          errorCode: 'request_cancelled',
          errorMessage: 'Pronunciation was stopped.',
        };
      }
      lastError = error;
    }
  }

  if (requests.length === 0 && !policy.allowWebSpeech) {
    return {
      ...stateBase,
      uiState: 'unsupported',
      errorCode: 'language_unsupported',
      errorMessage: 'No artifact-capable speech provider supports this language.',
    };
  }

  return {
    ...stateBase,
    uiState: 'failed',
    errorCode: lastError instanceof TtsError ? lastError.code : 'generation_failed',
    errorMessage: failureMessage(lastError),
  };
}

export interface EnqueueCardWithAudioInput {
  note: Parameters<AnkiQueue['enqueue']>[0];
  pronunciationRequests?: PronunciationRequest[];
  pronunciationRequest?: PronunciationRequest;
  artifactKey?: string;
}

/** Queue-first add. A post-feature item is never downgraded to text-only. */
export async function enqueueCardWithRequiredAudio(
  queue: AnkiQueue,
  input: EnqueueCardWithAudioInput,
  artifactStore?: PronunciationArtifactStore,
): Promise<{ itemId: string; audioStatus: string }> {
  const requests = input.pronunciationRequests ??
    (input.pronunciationRequest ? [input.pronunciationRequest] : []);
  if (requests.length === 0) {
    throw new TtsError('language_unsupported', 'No pronunciation provider is authorized.');
  }
  if (input.artifactKey && artifactStore) {
    await artifactStore.pin(input.artifactKey);
  }

  const item = await queue.enqueue(input.note, {
    pronunciationRequests: requests,
    artifactKey: input.artifactKey,
    audioStatus: input.artifactKey ? 'ready_to_sync' : 'waiting_for_audio',
  });

  return { itemId: item.id, audioStatus: item.audioStatus ?? 'waiting_for_audio' };
}

/** Resume ordered artifact generation for queued cards after page or browser restart. */
export async function fulfillQueuedPronunciation(
  queue: AnkiQueue,
  dependencies: PronunciationWorkflowDependencies,
  signal?: AbortSignal,
): Promise<void> {
  const items = await queue.list();
  for (const item of items) {
    if (
      item.audioStatus !== 'waiting_for_audio' &&
      item.audioStatus !== 'audio_failed' &&
      item.audioStatus !== 'sync_failed'
    ) {
      continue;
    }
    const requests = item.pronunciationRequests ??
      (item.pronunciationRequest ? [item.pronunciationRequest] : []);
    if (requests.length === 0) continue;

    let lastError = 'Pronunciation audio generation failed.';
    let fulfilled = false;
    for (const request of requests) {
      if (signal?.aborted) return;
      const speechPack = requiredSpeechModelPackForRequest(request);
      if (speechPack && (await dependencies.getSpeechPackStatus(speechPack.id)) !== 'ready') {
        lastError = `Speech model pack ${speechPack.id} is not installed.`;
        continue;
      }

      const { artifactKey, filename } = await computeArtifactIdentity(request);
      try {
        const existing = await dependencies.artifactStore.get(artifactKey);
        if (existing) {
          await dependencies.artifactStore.pin(artifactKey);
        } else {
          const artifact = await dependencies.synthesize(request, signal);
          await dependencies.artifactStore.put(
            { ...artifact, artifactKey, filename: artifact.filename || filename },
            { pinned: true },
          );
        }
        await queue.setAudioReady(item.id, artifactKey);
        fulfilled = true;
        break;
      } catch (error) {
        if (isCancellation(error, signal)) return;
        lastError = failureMessage(error);
      }
    }

    if (!fulfilled) {
      await queue.setAudioFailed(item.id, lastError);
    }
  }
}
