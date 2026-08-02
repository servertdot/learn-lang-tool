import browser from 'webextension-polyfill';
import type {
  AnkiAddNoteResponse,
  PronunciationPlaybackResponse,
  PronunciationPrepareResponse,
  SpeechModelPackInstallResponse,
  SpeechModelPackStatusResponse,
} from './extension-messages';
import type { PronunciationRequest } from './audio-tts-provider';
import type { AnkiCardContent } from './anki';
import type { AnkiAddResult } from './messaging-anki';
import {
  playPronunciationPreview,
  type PronunciationPreviewDependencies,
} from './pronunciation-preview';
import type {
  PronunciationSessionState,
  PronunciationWorkflowInput,
} from './pronunciation-workflow';
import { speakWithBrowser, stopBrowserSpeech } from './browser-speech';

export async function requestPronunciationPrepare(
  input: PronunciationWorkflowInput,
  signal?: AbortSignal,
): Promise<PronunciationPrepareResponse> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const cancel = () => void requestPronunciationCancel(input.requestId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return (await browser.runtime.sendMessage({
      type: 'llt.pronunciation.prepare',
      input,
    })) as PronunciationPrepareResponse;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export async function requestPronunciationCancel(
  requestId: string,
  options: { discardSession?: boolean } = {},
): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'llt.pronunciation.cancel',
    requestId,
    discardSession: options.discardSession,
  });
}

export async function requestPronunciationPlay(
  artifactKey: string,
): Promise<PronunciationPlaybackResponse> {
  return browser.runtime.sendMessage({
    type: 'llt.pronunciation.play',
    artifactKey,
  }) as Promise<PronunciationPlaybackResponse>;
}

export async function requestPronunciationStop(): Promise<PronunciationPlaybackResponse> {
  return browser.runtime.sendMessage({
    type: 'llt.pronunciation.stop',
  }) as Promise<PronunciationPlaybackResponse>;
}

export async function requestSpeechModelPackStatus(
  packId: string,
): Promise<SpeechModelPackStatusResponse> {
  return browser.runtime.sendMessage({
    type: 'llt.speechModelPack.getStatus',
    packId,
  }) as Promise<SpeechModelPackStatusResponse>;
}

export async function requestSpeechModelPackInstall(
  packId: string,
): Promise<SpeechModelPackInstallResponse> {
  return browser.runtime.sendMessage({
    type: 'llt.speechModelPack.install',
    packId,
  }) as Promise<SpeechModelPackInstallResponse>;
}

export async function requestSpeechModelPackCancel(packId: string): Promise<void> {
  await browser.runtime.sendMessage({ type: 'llt.speechModelPack.cancel', packId });
}

export async function requestAddToAnkiWithPronunciation(
  content: AnkiCardContent,
  options: {
    pronunciationRequests?: PronunciationRequest[];
    pronunciationRequest?: PronunciationRequest;
    artifactKey?: string;
  } = {},
): Promise<AnkiAddResult> {
  const response = (await browser.runtime.sendMessage({
    type: 'llt.anki.addNote',
    content,
    pronunciationRequests: options.pronunciationRequests,
    pronunciationRequest: options.pronunciationRequest,
    artifactKey: options.artifactKey,
  })) as AnkiAddNoteResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.status === 'synced'
    ? { status: 'synced', noteId: response.noteId, queuedCount: response.queuedCount }
    : { status: 'queued', queuedCount: response.queuedCount };
}

function sessionStateFromResponse(
  input: PronunciationWorkflowInput,
  response: PronunciationPrepareResponse,
): PronunciationSessionState {
  if (!response.ok) {
    return {
      requestId: input.requestId,
      uiState: 'failed',
      errorCode: 'generation_failed',
      errorMessage: response.error,
    };
  }
  return {
    requestId: response.requestId,
    uiState: response.uiState,
    artifactKey: response.artifactKey,
    providerId: response.providerId,
    playbackKind: response.playbackKind,
    speechModelPackId: response.speechModelPackId,
    approxSizeBytes: response.approxSizeBytes,
    errorCode: response.errorCode,
    errorMessage: response.errorMessage,
    pronunciationRequests: response.pronunciationRequests,
    pronunciationRequest: response.pronunciationRequest,
  };
}

export function browserPronunciationPreviewDependencies(
  scope: Window,
): PronunciationPreviewDependencies {
  return {
    async prepare(input, signal) {
      return sessionStateFromResponse(
        input,
        await requestPronunciationPrepare(input, signal),
      );
    },
    async playArtifact(artifactKey) {
      const response = await requestPronunciationPlay(artifactKey);
      if (!response.ok) throw new Error(response.error);
    },
    playWebSpeech: (text, language, signal) =>
      speakWithBrowser(text, language, scope, signal),
    async stop() {
      stopBrowserSpeech(scope);
      await requestPronunciationStop().catch(() => undefined);
    },
  };
}

export function playPronunciationPreviewInBrowser(
  input: PronunciationWorkflowInput,
  scope: Window,
  signal?: AbortSignal,
): Promise<PronunciationSessionState> {
  return playPronunciationPreview(
    input,
    browserPronunciationPreviewDependencies(scope),
    signal,
  );
}
