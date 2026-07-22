import type { TranslateResponse } from '@package/shared';
import { getAnkiAudioFieldNames, type AnkiCardContent, type AnkiSettings } from './anki';
import type { AnkiConnectAudioAttachment } from './anki-connect';
import type { AnkiQueue } from './anki-queue';
import type { PronunciationRequest } from './audio-tts-provider';
import { bytesToBase64 } from './pronunciation-artifact-store';
import type { PronunciationArtifactStore } from './pronunciation-artifact-store';
import {
  enqueueCardWithRequiredAudio,
  fulfillQueuedPronunciation,
  preparePronunciationForResult,
  type PronunciationSessionState,
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

export async function preparePronunciation(
  requestId: string,
  result: TranslateResponse,
  dependencies: PronunciationRuntimeDependencies,
): Promise<PronunciationSessionState> {
  prepareAborts.get(requestId)?.abort();
  const controller = new AbortController();
  prepareAborts.set(requestId, controller);

  try {
    return await preparePronunciationForResult(
      result,
      requestId,
      {
        ttsProvider: {
          id: 'kokoro',
          revision: 'v1.0',
          supportsLanguage: () => true,
          requiredModelPackIds: () => [],
          synthesize: async () => {
            throw new Error('synthesize must go through offscreen');
          },
        },
        artifactStore: dependencies.artifactStore,
        getSpeechPackStatus: packId => dependencies.speechPackStore.getStatus(packId),
        synthesize: async (request, signal) => {
          await dependencies.ensureOffscreenDocument();
          const response = await dependencies.sendToOffscreen({
            type: 'llt.offscreen.synthesize',
            requestId,
            pronunciationRequest: request,
          });
          if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          if (!response.ok || !('artifact' in response) || !response.artifact) {
            throw new Error(
              ('error' in response && typeof response.error === 'string'
                ? response.error
                : null) ?? 'Speech generation failed.',
            );
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
          const { base64ToBytes } = await import('./pronunciation-artifact-store');
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
        },
      },
      controller.signal,
    );
  } finally {
    if (prepareAborts.get(requestId) === controller) {
      prepareAborts.delete(requestId);
    }
  }
}

export function cancelPronunciationPrepare(requestId: string): void {
  prepareAborts.get(requestId)?.abort();
  prepareAborts.delete(requestId);
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
    pronunciationRequest?: PronunciationRequest;
    artifactKey?: string;
  },
  createNote: (settings: AnkiSettings, content: AnkiCardContent) => ReturnType<
    typeof import('./anki').createAnkiNote
  >,
  artifactStore: PronunciationArtifactStore,
): Promise<{ itemId: string; audioStatus: string }> {
  const note = createNote(settings, content);
  if (!options.pronunciationRequest) {
    const item = await queue.enqueue(note);
    return { itemId: item.id, audioStatus: item.audioStatus ?? 'legacy_text_only' };
  }
  return enqueueCardWithRequiredAudio(
    queue,
    {
      note,
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
    ttsProvider: {
      id: 'kokoro',
      revision: 'v1.0',
      supportsLanguage: () => true,
      requiredModelPackIds: () => [],
      synthesize: async () => {
        throw new Error('synthesize must go through offscreen');
      },
    },
    artifactStore: dependencies.artifactStore,
    getSpeechPackStatus: packId => dependencies.speechPackStore.getStatus(packId),
    synthesize: async (request, signal) => {
      const requestId = `queue-${Date.now()}`;
      await dependencies.ensureOffscreenDocument();
      const response = await dependencies.sendToOffscreen({
        type: 'llt.offscreen.synthesize',
        requestId,
        pronunciationRequest: request,
      });
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (!response.ok || !('artifact' in response) || !response.artifact) {
        throw new Error(
          ('error' in response && typeof response.error === 'string'
            ? response.error
            : null) ?? 'Speech generation failed.',
        );
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
      const { base64ToBytes } = await import('./pronunciation-artifact-store');
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
    },
  });
}

export function speechPackApproxSize(packId: string): number | undefined {
  return getSpeechModelPack(packId)?.approxSizeBytes;
}
