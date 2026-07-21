import type { TranslateRequest, TranslateResponse } from '@package/shared';
import browser from 'webextension-polyfill';
import type { LltMessage } from './extension-messages';
import type { TranslationEngine } from './translation-facade';
import { TranslationFacadeError } from './translation-facade';
import type { ModelPackStatus } from './model-pack-store';

function newRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createMessagingTranslationEngine(): TranslationEngine {
  return {
    async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
      const requestId = newRequestId();

      return new Promise((resolve, reject) => {
        const onMessage = (message: unknown) => {
          const msg = message as LltMessage;
          if (msg.type === 'llt.translate.result' && msg.requestId === requestId) {
            cleanup();
            resolve(msg.result);
          }
          if (msg.type === 'llt.translate.error' && msg.requestId === requestId) {
            cleanup();
            reject(new TranslationFacadeError(msg.error.code, msg.error.message));
          }
        };

        const onAbort = () => {
          void browser.runtime.sendMessage({
            type: 'llt.offscreen.abortTranslate',
            requestId,
          } satisfies LltMessage);
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };

        const cleanup = () => {
          browser.runtime.onMessage.removeListener(onMessage);
          signal?.removeEventListener('abort', onAbort);
        };

        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        signal?.addEventListener('abort', onAbort, { once: true });
        browser.runtime.onMessage.addListener(onMessage);

        const outbound: LltMessage = { type: 'llt.translate', requestId, request };
        void browser.runtime.sendMessage(outbound).catch(err => {
          cleanup();
          reject(
            new TranslationFacadeError(
              'engine_failure',
              err instanceof Error ? err.message : 'Messaging failed',
            ),
          );
        });
      });
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
