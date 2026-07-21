import type { TranslateRequest, TranslateResponse } from '@package/shared';
import browser from 'webextension-polyfill';
import type { LltMessage } from './extension-messages';
import type { TranslationEngine } from './translation-facade';
import { TranslationFacadeError } from './translation-facade';
import type { ModelPackStatus } from './model-pack-store';
import { lltError, lltLog } from './debug-log';

function newRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createMessagingTranslationEngine(): TranslationEngine {
  return {
    async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
      const requestId = newRequestId();
      lltLog('content', 'translate →', {
        requestId,
        from: request.from_code,
        to: request.to_code,
        text: request.text.slice(0, 120),
        textLen: request.text.length,
      });

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const onAbort = () => {
        lltLog('content', 'translate abort', requestId);
        void browser.runtime.sendMessage({
          type: 'llt.translate.cancel',
          requestId,
        } satisfies LltMessage);
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        // Result must come via sendResponse. runtime.sendMessage broadcasts from the
        // service worker do not reliably reach content scripts.
        const response = (await browser.runtime.sendMessage({
          type: 'llt.translate',
          requestId,
          request,
        } satisfies LltMessage)) as LltMessage | { ok?: boolean; error?: string } | undefined;

        lltLog('content', 'translate ←', response);

        if (response && typeof response === 'object' && 'type' in response) {
          if (response.type === 'llt.translate.result') {
            return response.result;
          }
          if (response.type === 'llt.translate.error') {
            throw new TranslationFacadeError(response.error.code, response.error.message);
          }
        }

        const fallback =
          response && typeof response === 'object' && 'error' in response
            ? String(response.error)
            : 'Empty translation response from background';
        throw new TranslationFacadeError('engine_failure', fallback);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (err instanceof TranslationFacadeError) throw err;
        lltError('content', 'translate failed', err);
        throw new TranslationFacadeError(
          'engine_failure',
          err instanceof Error ? err.message : 'Messaging failed',
        );
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

export async function requestModelPackStatus(packId: string): Promise<ModelPackStatus> {
  const response = (await browser.runtime.sendMessage({
    type: 'llt.modelPack.getStatus',
    packId,
  } satisfies LltMessage)) as LltMessage;

  if (response?.type === 'llt.modelPack.status') {
    return response.status;
  }
  return 'missing';
}

export async function requestModelPackInstall(packId: string): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: 'llt.modelPack.install',
    packId,
  } satisfies LltMessage)) as { ok?: boolean; error?: string; aborted?: boolean } | undefined;

  if (!response?.ok) {
    if (response?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw new Error(response?.error || 'Model pack install failed');
  }
}

export async function requestModelPackCancel(packId: string): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'llt.modelPack.cancel',
    packId,
  } satisfies LltMessage);
}
