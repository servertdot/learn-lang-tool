import browser from 'webextension-polyfill';
import type { TranslateResponse } from '@package/shared';
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

export async function requestPronunciationPrepare(
  requestId: string,
  result: TranslateResponse,
): Promise<PronunciationPrepareResponse> {
  return browser.runtime.sendMessage({
    type: 'llt.pronunciation.prepare',
    requestId,
    result,
  }) as Promise<PronunciationPrepareResponse>;
}

export async function requestPronunciationCancel(requestId: string): Promise<void> {
  await browser.runtime.sendMessage({ type: 'llt.pronunciation.cancel', requestId });
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
    pronunciationRequest?: PronunciationRequest;
    artifactKey?: string;
  } = {},
): Promise<AnkiAddResult> {
  const response = (await browser.runtime.sendMessage({
    type: 'llt.anki.addNote',
    content,
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
