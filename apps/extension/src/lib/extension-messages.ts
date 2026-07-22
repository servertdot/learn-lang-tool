/** Shared message protocol between content, background, and offscreen. */

import type { TranslateRequest, TranslateResponse } from '@package/shared';
import type { ModelPackStatus } from './model-pack-store';
import type { TranslationFacadeErrorCode } from './translation-facade';
import type { AnkiCardContent } from './anki';
import type { AnkiExportFormat } from './anki-export';
import type { PageTextSourceKind } from './page-text-source';

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
    }
  | { ok: false; error: string };

export type AnkiQueueExportResponse =
  | { ok: true; content: string; filename: string; mimeType: string }
  | { ok: false; error: string };

export type AnkiQueueClearResponse = { ok: true } | { ok: false; error: string };

export type LltMessage =
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
  | { type: 'llt.anki.addNote'; content: AnkiCardContent }
  | { type: 'llt.anki.viewNote'; noteId: number }
  | { type: 'llt.anki.getCollectionInfo' }
  | { type: 'llt.anki.getModelFieldNames'; modelName: string }
  | { type: 'llt.anki.queue.getInfo' }
  | { type: 'llt.anki.queue.sync' }
  | { type: 'llt.anki.queue.export'; format: AnkiExportFormat }
  | { type: 'llt.anki.queue.clear' }
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
  | { type: 'llt.offscreen.abortTranslate'; requestId: string };

export type OffscreenResponse =
  | { ok: true; result: TranslateResponse }
  | { ok: true }
  | { ok: false; error: string; aborted?: boolean };
