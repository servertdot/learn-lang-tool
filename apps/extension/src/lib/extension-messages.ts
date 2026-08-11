/** Shared message protocol between content, background, and offscreen. */

import type { TranslateRequest, TranslateResponse } from '@package/shared';
import type { ModelPackStatus } from './model-pack-store';
import type { TranslationFacadeErrorCode } from './translation-facade';
import type { AnkiCardContent } from './anki';
import type { AnkiExportFormat } from './anki-export';
import type { PageTextSourceKind } from './page-text-source';
import type { AnkiDuplicateConflict } from './anki-queue-sync';

export type AnkiAddNoteResponse =
  | { ok: true; status: 'synced'; noteId: number; queuedCount: number }
  | { ok: true; status: 'queued'; queuedCount: number }
  | { ok: false; error: string };

export type AnkiViewNoteResponse = { ok: true } | { ok: false; error: string };

export type AnkiCollectionInfoResponse =
  | { ok: true; deckNames: string[]; modelNames: string[] }
  | { ok: false; error: string };

export type AnkiModelFieldNamesResponse =
  | { ok: true; fieldNames: string[] }
  | { ok: false; error: string };

export type AnkiQueueInfoResponse =
  | { ok: true; count: number; failedCount: number; lastError?: string }
  | { ok: false; error: string };

export type AnkiQueueSyncResponse =
  | {
      ok: true;
      syncedCount: number;
      count: number;
      failedCount: number;
      lastError?: string;
      duplicateConflicts: AnkiDuplicateConflict[];
    }
  | { ok: false; error: string };

export type AnkiDuplicateDecision = {
  queueItemId: string;
  action: 'add' | 'skip';
};

export type AnkiQueueExportResponse =
  | { ok: true; content: string; filename: string; mimeType: string }
  | { ok: false; error: string };

export type AnkiQueueClearResponse = { ok: true } | { ok: false; error: string };

export type OpenOptionsPageResponse = { ok: true } | { ok: false; error: string };

export type PronunciationPrepareResponse =
  | {
      ok: true;
      requestId: string;
      uiState: import('./pronunciation-workflow').PronunciationUiState;
      artifactKey?: string;
      speechModelPackId?: string;
      approxSizeBytes?: number;
      errorCode?: string;
      errorMessage?: string;
      providerId?: string;
      playbackKind?: import('./pronunciation-workflow').PronunciationPlaybackKind;
      pronunciationRequests?: import('./audio-tts-provider').PronunciationRequest[];
      pronunciationRequest?: import('./audio-tts-provider').PronunciationRequest;
    }
  | { ok: false; error: string };

export type PronunciationPlaybackResponse = { ok: true } | { ok: false; error: string };

export type SpeechModelPackStatusResponse =
  | {
      ok: true;
      packId: string;
      status: ModelPackStatus;
      errorMessage?: string;
      approxSizeBytes?: number;
    }
  | { ok: false; error: string };

export type SpeechModelPackInstallResponse =
  | { ok: true }
  | { ok: false; error?: string; aborted?: boolean };

export type LltMessage =
  | { type: 'llt.pageSelection.get'; tabId?: number }
  | { type: 'llt.selection.translate'; text: string; pageUrl?: string }
  | { type: 'llt.translate'; requestId: string; request: TranslateRequest }
  | { type: 'llt.translate.cancel'; requestId: string }
  | {
      type: 'llt.translate.result';
      requestId: string;
      result: TranslateResponse;
    }
  | {
      type: 'llt.translate.error';
      requestId: string;
      error: { code: TranslationFacadeErrorCode; message: string };
    }
  | { type: 'llt.modelPack.getStatus'; packId: string }
  | {
      type: 'llt.modelPack.status';
      packId: string;
      status: ModelPackStatus;
      errorMessage?: string;
    }
  | { type: 'llt.modelPack.install'; packId: string }
  | { type: 'llt.modelPack.cancel'; packId: string }
  | { type: 'llt.speechModelPack.getStatus'; packId: string }
  | { type: 'llt.speechModelPack.install'; packId: string }
  | { type: 'llt.speechModelPack.cancel'; packId: string }
  | {
      type: 'llt.speechModelPack.changed';
      packId: string;
      status: ModelPackStatus;
      errorMessage?: string;
    }
  | {
      type: 'llt.pronunciation.prepare';
      input: import('./pronunciation-workflow').PronunciationWorkflowInput;
    }
  | { type: 'llt.pronunciation.cancel'; requestId: string; discardSession?: boolean }
  | { type: 'llt.pronunciation.play'; artifactKey: string }
  | { type: 'llt.pronunciation.stop' }
  | {
      type: 'llt.anki.addNote';
      content: AnkiCardContent;
      pronunciationRequests?: import('./audio-tts-provider').PronunciationRequest[];
      pronunciationRequest?: import('./audio-tts-provider').PronunciationRequest;
      artifactKey?: string;
    }
  | { type: 'llt.anki.viewNote'; noteId: number }
  | { type: 'llt.anki.getCollectionInfo' }
  | { type: 'llt.anki.getModelFieldNames'; modelName: string }
  | { type: 'llt.anki.queue.getInfo' }
  | { type: 'llt.anki.queue.sync' }
  | { type: 'llt.anki.queue.resolveDuplicates'; decisions: AnkiDuplicateDecision[] }
  | { type: 'llt.anki.queue.export'; format: AnkiExportFormat }
  | { type: 'llt.anki.queue.clear' }
  | { type: 'llt.openOptionsPage' }
  | { type: 'llt.frameTextSource'; text: string; sourceKind: PageTextSourceKind }
  | {
      type: 'llt.modelPack.changed';
      packId: string;
      status: ModelPackStatus;
      errorMessage?: string;
    }
  | { type: 'llt.offscreen.translate'; request: TranslateRequest; requestId?: string }
  | { type: 'llt.offscreen.install'; packId: string }
  | { type: 'llt.offscreen.cancelInstall' }
  | { type: 'llt.offscreen.abortTranslate'; requestId: string }
  | {
      type: 'llt.offscreen.synthesize';
      requestId: string;
      pronunciationRequest: import('./audio-tts-provider').PronunciationRequest;
    }
  | { type: 'llt.offscreen.abortSynthesize'; requestId: string }
  | { type: 'llt.offscreen.playArtifact'; artifactKey: string; dataBase64: string; mimeType: string }
  | { type: 'llt.offscreen.stopPlayback' };

export type OffscreenResponse =
  | { ok: true; result: TranslateResponse }
  | {
      ok: true;
      artifact: {
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
    }
  | { ok: true }
  | { ok: false; error: string; aborted?: boolean; code?: string };
