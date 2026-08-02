import { getAnkiAudioFieldNames, type AnkiCardContent, type AnkiSettings } from './anki';
import type { AnkiConnectAudioAttachment } from './anki-connect';
import type { AnkiQueue } from './anki-queue';
import { TtsError, type PronunciationRequest } from './audio-tts-provider';
import { base64ToBytes, bytesToBase64 } from './pronunciation-artifact-store';
import type { PronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  enqueueCardWithRequiredAudio,
  fulfillQueuedPronunciation,
  runPronunciationWorkflow,
  type PronunciationSessionState,
  type PronunciationWorkflowInput,
} from './pronunciation-workflow';
import type { ModelPackStore } from './model-pack-store';
import { getSpeechModelPack } from './speech-model-pack-registry';
import type { OffscreenResponse } from './extension-messages';

export interface PronunciationRuntimeDependencies {
  speechPackStore: ModelPackStore;
  artifactStore: PronunciationArtifactStore;
  ankiQueue: AnkiQueue;
  ensureOffscreenDocument(): Promise<void>;
  sendToOffscreen(message: unknown): Promise<OffscreenResponse & Record<string, unknown>>;
}

const prepareAborts = new Map<string, AbortController>();
const previewArtifactKeys = new Map<string, Set<string>>();

async function synthesizeThroughOffscreen(
  requestId: string,
  request: PronunciationRequest,
  dependencies: PronunciationRuntimeDependencies,
  signal?: AbortSignal,
) {
  await dependencies.ensureOffscreenDocument();
  const response = await dependencies.sendToOffscreen({
    type: 'llt.offscreen.synthesize',
    requestId,
    pronunciationRequest: request,
  });
  if (signal?.aborted) {
    throw new TtsError('request_cancelled', 'Pronunciation preparation was cancelled.');
  }
  if (!response.ok || !('artifact' in response) || !response.artifact) {
    const message =
      ('error' in response && typeof response.error === 'string' ? response.error : null) ??
      'Speech generation failed.';
    if ('code' in response && response.code === 'request_cancelled') {
      throw new TtsError('request_cancelled', message);
    }
    throw new TtsError('generation_failed', message);
  }
  const artifact = response.artifact as {
    artifactKey: string;
    filename: string;
    dataBase64: string;
    mimeType: string;
    extension: string;
    sampleRate: number;
    language: string;
    voiceId: string;
    speed: number;
  };
  return {
    artifactKey: artifact.artifactKey,
    filename: artifact.filename,
    bytes: base64ToBytes(artifact.dataBase64),
    mimeType: artifact.mimeType,
    extension: artifact.extension,
    sampleRate: artifact.sampleRate,
    language: artifact.language,
    voiceId: artifact.voiceId,
    speed: artifact.speed,
  };
}

export async function preparePronunciation(
  input: PronunciationWorkflowInput,
  dependencies: PronunciationRuntimeDependencies,
): Promise<PronunciationSessionState> {
  prepareAborts.get(input.requestId)?.abort();
  const controller = new AbortController();
  prepareAborts.set(input.requestId, controller);

  try {
    const state = await runPronunciationWorkflow(
      input,
      {
        artifactStore: dependencies.artifactStore,
        getSpeechPackStatus: packId => dependencies.speechPackStore.getStatus(packId),
        synthesize: (request, signal) =>
          synthesizeThroughOffscreen(input.requestId, request, dependencies, signal),
      },
      controller.signal,
    );
    if (state.artifactKey) {
      const keys = previewArtifactKeys.get(input.requestId) ?? new Set<string>();
      keys.add(state.artifactKey);
      previewArtifactKeys.set(input.requestId, keys);
    }
    return state;
  } finally {
    if (prepareAborts.get(input.requestId) === controller) {
      prepareAborts.delete(input.requestId);
    }
  }
}

export function cancelPronunciationPrepare(requestId: string): void {
  prepareAborts.get(requestId)?.abort();
  prepareAborts.delete(requestId);
}

export async function discardPronunciationSession(
  requestId: string,
  dependencies: PronunciationRuntimeDependencies,
): Promise<void> {
  cancelPronunciationPrepare(requestId);
  const artifactKeys = previewArtifactKeys.get(requestId);
  previewArtifactKeys.delete(requestId);
  if (!artifactKeys) return;
  for (const artifactKey of artifactKeys) {
    const entry = await dependencies.artifactStore.get(artifactKey);
    if (entry && !entry.pinned) {
      await dependencies.artifactStore.delete(artifactKey);
    }
  }
}

export async function playPronunciationArtifact(
  artifactKey: string,
  dependencies: PronunciationRuntimeDependencies,
): Promise<void> {
  const entry = await dependencies.artifactStore.get(artifactKey);
  if (!entry) {
    throw new Error('Pronunciation audio is no longer available.');
  }
  await dependencies.artifactStore.touch(artifactKey);
  await dependencies.ensureOffscreenDocument();
  const response = await dependencies.sendToOffscreen({
    type: 'llt.offscreen.playArtifact',
    artifactKey,
    dataBase64: bytesToBase64(entry.bytes),
    mimeType: entry.mimeType,
  });
  if (!response.ok) {
    throw new Error(
      ('error' in response && typeof response.error === 'string' ? response.error : null) ??
        'Could not play pronunciation.',
    );
  }
}

export async function stopPronunciationPlayback(
  dependencies: PronunciationRuntimeDependencies,
): Promise<void> {
  await dependencies.ensureOffscreenDocument();
  await dependencies.sendToOffscreen({ type: 'llt.offscreen.stopPlayback' });
}

export async function enqueueAnkiWithPronunciation(
  queue: AnkiQueue,
  settings: AnkiSettings,
  content: AnkiCardContent,
  options: {
    pronunciationRequests?: PronunciationRequest[];
    pronunciationRequest?: PronunciationRequest;
    artifactKey?: string;
  },
  createNote: (settings: AnkiSettings, content: AnkiCardContent) => ReturnType<
    typeof import('./anki').createAnkiNote
  >,
  artifactStore: PronunciationArtifactStore,
): Promise<{ itemId: string; audioStatus: string }> {
  const note = createNote(settings, content);
  return enqueueCardWithRequiredAudio(
    queue,
    {
      note,
      pronunciationRequests: options.pronunciationRequests,
      pronunciationRequest: options.pronunciationRequest,
      artifactKey: options.artifactKey,
    },
    artifactStore,
  );
}

export function audioAttachmentForSettings(
  settings: AnkiSettings,
  filename: string,
  dataBase64: string,
): AnkiConnectAudioAttachment | undefined {
  const fields = getAnkiAudioFieldNames(settings);
  if (fields.length === 0) return undefined;
  return { filename, data: dataBase64, fields };
}

export async function fulfillAndSyncAudioQueue(
  dependencies: PronunciationRuntimeDependencies,
): Promise<void> {
  await fulfillQueuedPronunciation(dependencies.ankiQueue, {
    artifactStore: dependencies.artifactStore,
    getSpeechPackStatus: packId => dependencies.speechPackStore.getStatus(packId),
    synthesize: (request, signal) =>
      synthesizeThroughOffscreen(`queue-${crypto.randomUUID()}`, request, dependencies, signal),
  });
}

export function speechPackApproxSize(packId: string): number | undefined {
  return getSpeechModelPack(packId)?.approxSizeBytes;
}
