import browser from 'webextension-polyfill';
import type { LltMessage, OffscreenResponse } from '@src/lib/extension-messages';
import { createChromeModelPackPersistence } from '@src/lib/model-pack-persistence';
import { createModelPackStore } from '@src/lib/model-pack-store';
import { MODEL_PACK_REGISTRY, getModelPackForLanguagePair } from '@src/lib/model-pack-registry';
import {
  cancelModelPackInstall,
  installModelPackFiles,
} from '@src/lib/model-pack-installer';

const OFFSCREEN_URL = 'src/pages/offscreen/index.html';
const OFFSCREEN_REASONS = ['WORKERS' as chrome.offscreen.Reason];
const OFFSCREEN_JUSTIFICATION =
  'Run the on-device Bergamot translation engine outside content scripts.';

const modelPackStore = createModelPackStore(createChromeModelPackPersistence());

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
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

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(message)) as OffscreenResponse;
    } catch (err) {
      lastError = err;
      const text = err instanceof Error ? err.message : String(err);
      const transient =
        text.includes('Receiving end does not exist') ||
        text.includes('Could not establish connection');
      if (!transient) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not reach offscreen translation engine');
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
    try {
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
          sendResponse({ ok: false, error: 'Unknown model pack' });
          return;
        }

        await modelPackStore.markDownloading(message.packId);
        broadcastPackChanged(message.packId, 'downloading');

        try {
          await installModelPackFiles(packById.from_code, packById.to_code);
          await modelPackStore.markReady(message.packId);
          broadcastPackChanged(message.packId, 'ready');
          sendResponse({ ok: true });
        } catch (err) {
          const aborted =
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err instanceof Error && err.name === 'AbortError');

          if (aborted) {
            await modelPackStore.markCancelled(message.packId);
            broadcastPackChanged(message.packId, 'missing');
            sendResponse({ ok: false, aborted: true });
            return;
          }

          const error = err instanceof Error ? err.message : 'Install failed';
          await modelPackStore.markFailed(message.packId, error);
          broadcastPackChanged(message.packId, 'failed', error);
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === 'llt.modelPack.cancel') {
        cancelModelPackInstall();
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
          await browser.runtime.sendMessage(errorMsg).catch(() => undefined);
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
          await browser.runtime.sendMessage(errorMsg).catch(() => undefined);
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
          await browser.runtime.sendMessage(resultMsg).catch(() => undefined);
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
        await browser.runtime.sendMessage(errorMsg).catch(() => undefined);
        sendResponse({ ok: false });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Background failure';
      sendResponse({ ok: false, error });
    }
  })();

  return true;
});

console.log('background script loaded');
