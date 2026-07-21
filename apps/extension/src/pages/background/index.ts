import browser from 'webextension-polyfill';
import type { LltMessage, OffscreenResponse } from '@src/lib/extension-messages';
import { createChromeModelPackPersistence } from '@src/lib/model-pack-persistence';
import { createModelPackStore } from '@src/lib/model-pack-store';
import { MODEL_PACK_REGISTRY, getModelPackForLanguagePair } from '@src/lib/model-pack-registry';

const OFFSCREEN_URL = 'src/pages/offscreen/index.html';
const OFFSCREEN_REASONS = ['WORKERS' as chrome.offscreen.Reason];
const OFFSCREEN_JUSTIFICATION =
  'Run the on-device Bergamot translation engine outside content scripts.';

const modelPackStore = createModelPackStore(createChromeModelPackPersistence());

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: OFFSCREEN_REASONS,
    justification: OFFSCREEN_JUSTIFICATION,
  });
}

async function sendToOffscreen(message: LltMessage): Promise<OffscreenResponse> {
  await ensureOffscreenDocument();
  return (await chrome.runtime.sendMessage(message)) as OffscreenResponse;
}

function broadcastPackChanged(
  packId: string,
  status: Awaited<ReturnType<typeof modelPackStore.getStatus>>,
  errorMessage?: string,
): void {
  const msg: LltMessage = {
    type: 'llt.modelPack.changed',
    packId,
    status,
    errorMessage,
  };
  void chrome.runtime.sendMessage(msg).catch(() => {
    /* no listeners */
  });
}

chrome.runtime.onMessage.addListener((message: LltMessage, _sender, sendResponse) => {
  if (
    message.type === 'llt.offscreen.translate' ||
    message.type === 'llt.offscreen.install' ||
    message.type === 'llt.offscreen.cancelInstall' ||
    message.type === 'llt.offscreen.abortTranslate' ||
    message.type === 'llt.translate.result' ||
    message.type === 'llt.translate.error' ||
    message.type === 'llt.modelPack.changed' ||
    message.type === 'llt.modelPack.status'
  ) {
    return false;
  }

  void (async () => {
    if (message.type === 'llt.modelPack.getStatus') {
      const state = await modelPackStore.getState(message.packId);
      sendResponse({
        type: 'llt.modelPack.status',
        packId: message.packId,
        status: state?.status ?? 'missing',
        errorMessage: state?.errorMessage,
      } satisfies LltMessage);
      return;
    }

    if (message.type === 'llt.modelPack.install') {
      const packById = MODEL_PACK_REGISTRY.find(pack => pack.id === message.packId);
      if (!packById) {
        await modelPackStore.markFailed(message.packId, 'Unknown model pack');
        broadcastPackChanged(message.packId, 'failed', 'Unknown model pack');
        sendResponse({ ok: false });
        return;
      }

      await modelPackStore.markDownloading(message.packId);
      broadcastPackChanged(message.packId, 'downloading');

      const response = await sendToOffscreen({
        type: 'llt.offscreen.install',
        packId: message.packId,
      });

      if (response.ok) {
        await modelPackStore.markReady(message.packId);
        broadcastPackChanged(message.packId, 'ready');
        sendResponse({ ok: true });
        return;
      }

      if (!response.ok && response.aborted) {
        await modelPackStore.markCancelled(message.packId);
        broadcastPackChanged(message.packId, 'missing');
        sendResponse({ ok: false, aborted: true });
        return;
      }

      const error = !response.ok ? response.error : 'Install failed';
      await modelPackStore.markFailed(message.packId, error);
      broadcastPackChanged(message.packId, 'failed', error);
      sendResponse({ ok: false, error });
      return;
    }

    if (message.type === 'llt.modelPack.cancel') {
      await sendToOffscreen({ type: 'llt.offscreen.cancelInstall' });
      await modelPackStore.markCancelled(message.packId);
      broadcastPackChanged(message.packId, 'missing');
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'llt.translate') {
      const pack = getModelPackForLanguagePair({
        from_code: message.request.from_code,
        to_code: message.request.to_code,
      });

      if (!pack) {
        const errorMsg: LltMessage = {
          type: 'llt.translate.error',
          requestId: message.requestId,
          error: {
            code: 'engine_failure',
            message: `No model pack for ${message.request.from_code}→${message.request.to_code}`,
          },
        };
        await browser.runtime.sendMessage(errorMsg);
        sendResponse({ ok: false });
        return;
      }

      const status = await modelPackStore.getStatus(pack.id);
      if (status !== 'ready') {
        const errorMsg: LltMessage = {
          type: 'llt.translate.error',
          requestId: message.requestId,
          error: {
            code: 'model_pack_missing',
            message: 'Install the translation model pack to translate offline.',
          },
        };
        await browser.runtime.sendMessage(errorMsg);
        sendResponse({ ok: false });
        return;
      }

      const response = await sendToOffscreen({
        type: 'llt.offscreen.translate',
        request: message.request,
        requestId: message.requestId,
      });

      if (response.ok && 'result' in response) {
        const resultMsg: LltMessage = {
          type: 'llt.translate.result',
          requestId: message.requestId,
          result: response.result,
        };
        await browser.runtime.sendMessage(resultMsg);
        sendResponse({ ok: true });
        return;
      }

      const errorMsg: LltMessage = {
        type: 'llt.translate.error',
        requestId: message.requestId,
        error: {
          code: 'engine_failure',
          message: !response.ok ? response.error : 'Translation failed',
        },
      };
      await browser.runtime.sendMessage(errorMsg);
      sendResponse({ ok: false });
    }
  })();

  return true;
});

console.log('background script loaded');
