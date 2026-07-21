/** Shared message protocol between content, background, and offscreen. */

import type { TranslateRequest, TranslateResponse } from '@package/shared';
import type { ModelPackStatus } from './model-pack-store';
import type { TranslationFacadeErrorCode } from './translation-facade';
import type { AnkiCardContent } from './anki';

export type AnkiAddNoteResponse =
  | { ok: true; noteId: number }
  | { ok: false; error: string };

export type AnkiViewNoteResponse = { ok: true } | { ok: false; error: string };

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
