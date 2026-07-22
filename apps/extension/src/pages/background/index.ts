import type {
  AnkiAddNoteResponse,
  AnkiCollectionInfoResponse,
  AnkiModelFieldNamesResponse,
  AnkiQueueClearResponse,
  AnkiQueueExportResponse,
  AnkiQueueInfoResponse,
  AnkiQueueSyncResponse,
  AnkiViewNoteResponse,
  LltMessage,
  OffscreenResponse,
  OpenOptionsPageResponse,
} from '@src/lib/extension-messages';
import { createChromeModelPackPersistence } from '@src/lib/model-pack-persistence';
import { createModelPackStore } from '@src/lib/model-pack-store';
import { MODEL_PACK_REGISTRY, getModelPackForLanguagePair } from '@src/lib/model-pack-registry';
import {
  cancelModelPackInstall,
  installModelPackFiles,
} from '@src/lib/model-pack-installer';
import { lltError, lltLog } from '@src/lib/debug-log';
import { getAnkiSettings, getTranslationProvider } from '@src/lib/storage';
import { createGoogleTranslationEngine } from '@src/lib/google-translation-engine';
import { createTranslationFacade, TranslationFacadeError } from '@src/lib/translation-facade';
import { MAX_TRANSLATION_TEXT_LENGTH } from '@package/shared';
import {
  addNoteWithAnkiConnect,
  browseNoteWithAnkiConnect,
  findQueuedNoteIdsWithAnkiConnect,
  getCollectionInfoWithAnkiConnect,
  getModelFieldNamesWithAnkiConnect,
  removeAnkiQueueTagWithAnkiConnect,
} from '@src/lib/anki-connect';
import { createAnkiNote } from '@src/lib/anki';
import { exportAnkiQueue } from '@src/lib/anki-export';
import { AnkiQueue, createChromeAnkiQueueStorage } from '@src/lib/anki-queue';
import { syncAnkiQueue } from '@src/lib/anki-queue-sync';
import {
  handleContextSelection,
  openSelectionResult,
  TRANSLATE_SELECTION_MENU_ID,
} from '@src/lib/context-selection';
import { savePendingSelection } from '@src/lib/pending-selection';
import { openExtensionOptionsPage } from '@src/lib/open-extension-options';

const OFFSCREEN_URL = 'src/pages/offscreen/index.html';
const OFFSCREEN_REASONS = ['WORKERS' as chrome.offscreen.Reason];
const OFFSCREEN_JUSTIFICATION =
  'Run the on-device Bergamot translation engine outside content scripts.';

const modelPackStore = createModelPackStore(createChromeModelPackPersistence());
const googleTranslationFacade = createTranslationFacade(createGoogleTranslationEngine(), {
  maxLength: MAX_TRANSLATION_TEXT_LENGTH,
});
const remoteTranslateAborts = new Map<string, AbortController>();
const ANKI_QUEUE_SYNC_ALARM = 'llt.anki.syncQueue';
const ankiQueue = new AnkiQueue(createChromeAnkiQueueStorage());
let ankiQueueSyncPromise: ReturnType<typeof runAnkiQueueSync> | null = null;

async function runAnkiQueueSync() {
  const settings = await getAnkiSettings();
  return syncAnkiQueue(ankiQueue, settings, {
    findNoteIds: findQueuedNoteIdsWithAnkiConnect,
    addNote: addNoteWithAnkiConnect,
    removeQueueTag: removeAnkiQueueTagWithAnkiConnect,
  });
}

async function syncQueuedAnkiCards() {
  if (!ankiQueueSyncPromise) {
    ankiQueueSyncPromise = runAnkiQueueSync().finally(() => {
      ankiQueueSyncPromise = null;
    });
  }
  return ankiQueueSyncPromise;
}

async function updateAnkiQueueSyncAlarm(): Promise<void> {
  const { count } = await ankiQueue.getInfo();
  if (count === 0) {
    await chrome.alarms.clear(ANKI_QUEUE_SYNC_ALARM);
    return;
  }
  const alarm = await chrome.alarms.get(ANKI_QUEUE_SYNC_ALARM);
  if (!alarm) {
    chrome.alarms.create(ANKI_QUEUE_SYNC_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
  }
}

function registerTranslateSelectionMenu(): void {
  chrome.contextMenus.create(
    {
      id: TRANSLATE_SELECTION_MENU_ID,
      title: 'Translate selection',
      contexts: ['selection'],
    },
    () => {
      // Reading lastError prevents duplicate-item errors from leaking on updates.
      void chrome.runtime.lastError;
    },
  );
}

// Unpacked-extension Reload does not consistently emit onInstalled. Register at
// worker startup as well; a duplicate create leaves the existing item intact.
registerTranslateSelectionMenu();
chrome.runtime.onInstalled.addListener(registerTranslateSelectionMenu);
chrome.runtime.onStartup.addListener(registerTranslateSelectionMenu);

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ANKI_QUEUE_SYNC_ALARM) return;
  void syncQueuedAnkiCards()
    .then(updateAnkiQueueSyncAlarm)
    .catch(error => lltError('bg', 'Anki queue sync failed', error));
});

void updateAnkiQueueSyncAlarm().catch(error => {
  lltError('bg', 'Could not schedule Anki queue sync', error);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextSelection(info, tab ?? {}, {
    saveSelection: savePendingSelection,
    openPopup: async windowId => {
      await openSelectionResult(windowId, {
        openActionPopup: id =>
          chrome.action.openPopup(id === undefined ? {} : { windowId: id }),
        openWindow: async () => {
          await chrome.windows.create({
            url: chrome.runtime.getURL('src/pages/popup/index.html'),
            type: 'popup',
            width: 400,
            height: 520,
          });
        },
      });
    },
  }).catch(error => {
    lltError('bg', 'context selection failed', error);
  });
});

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

chrome.runtime.onMessage.addListener((message: LltMessage, sender, sendResponse) => {
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
      if (message.type === 'llt.openOptionsPage') {
        await openExtensionOptionsPage();
        sendResponse({ ok: true } satisfies OpenOptionsPageResponse);
        return;
      }

      if (message.type === 'llt.frameTextSource') {
        if (sender.tab?.id === undefined) {
          sendResponse({ ok: false, error: 'Missing source tab' });
          return;
        }
        await chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'llt.translate.cancel') {
        remoteTranslateAborts.get(message.requestId)?.abort();
        void chrome.runtime
          .sendMessage({
            type: 'llt.offscreen.abortTranslate',
            requestId: message.requestId,
          } satisfies LltMessage)
          .catch(() => {
            /* offscreen document may not exist */
          });
        sendResponse({ ok: true });
        return;
      }

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

      if (message.type === 'llt.anki.addNote') {
        try {
          const settings = await getAnkiSettings();
          const note = createAnkiNote(settings, message.content);
          const item = await ankiQueue.enqueue(note);
          await updateAnkiQueueSyncAlarm();
          const syncResult = await syncQueuedAnkiCards();
          const info = await ankiQueue.getInfo();
          await updateAnkiQueueSyncAlarm();
          const noteId = syncResult.noteIds[item.id];
          if (noteId !== undefined) {
            sendResponse({
              ok: true,
              status: 'synced',
              noteId,
              queuedCount: info.count,
            } satisfies AnkiAddNoteResponse);
          } else {
            sendResponse({
              ok: true,
              status: 'queued',
              queuedCount: info.count,
            } satisfies AnkiAddNoteResponse);
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not save the card.';
          lltError('bg', 'Anki queue save failed', error);
          sendResponse({ ok: false, error } satisfies AnkiAddNoteResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.getInfo') {
        try {
          const info = await ankiQueue.getInfo();
          sendResponse({ ok: true, ...info } satisfies AnkiQueueInfoResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not read the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueInfoResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.sync') {
        try {
          const result = await syncQueuedAnkiCards();
          const info = await ankiQueue.getInfo();
          await updateAnkiQueueSyncAlarm();
          sendResponse({
            ok: true,
            syncedCount: result.syncedCount,
            ...info,
          } satisfies AnkiQueueSyncResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not sync the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueSyncResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.export') {
        try {
          const exported = exportAnkiQueue(await ankiQueue.list(), message.format);
          sendResponse({ ok: true, ...exported } satisfies AnkiQueueExportResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not export the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueExportResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.clear') {
        try {
          await ankiQueue.clear();
          await updateAnkiQueueSyncAlarm();
          sendResponse({ ok: true } satisfies AnkiQueueClearResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not clear the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueClearResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.getCollectionInfo') {
        try {
          const settings = await getAnkiSettings();
          const info = await getCollectionInfoWithAnkiConnect(settings);
          sendResponse({ ok: true, ...info } satisfies AnkiCollectionInfoResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not read Anki settings.';
          sendResponse({ ok: false, error } satisfies AnkiCollectionInfoResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.getModelFieldNames') {
        try {
          const settings = await getAnkiSettings();
          const fieldNames = await getModelFieldNamesWithAnkiConnect(
            settings,
            message.modelName,
          );
          sendResponse({ ok: true, fieldNames } satisfies AnkiModelFieldNamesResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not read model fields.';
          sendResponse({ ok: false, error } satisfies AnkiModelFieldNamesResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.viewNote') {
        try {
          const settings = await getAnkiSettings();
          await browseNoteWithAnkiConnect(settings, message.noteId);
          sendResponse({ ok: true } satisfies AnkiViewNoteResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not open the card in Anki.';
          lltError('bg', 'Anki browse note failed', error);
          sendResponse({ ok: false, error } satisfies AnkiViewNoteResponse);
        }
        return;
      }

      if (message.type === 'llt.translate') {
        const remoteController = new AbortController();
        remoteTranslateAborts.set(message.requestId, remoteController);
        const provider = await getTranslationProvider();
        lltLog('bg', 'translate →', {
          requestId: message.requestId,
          textLen: message.request.text.length,
          pair: `${message.request.from_code}→${message.request.to_code}`,
          provider,
        });

        if (remoteController.signal.aborted) {
          remoteTranslateAborts.delete(message.requestId);
          sendResponse({
            type: 'llt.translate.error',
            requestId: message.requestId,
            error: { code: 'engine_failure', message: 'Translation cancelled' },
          } satisfies LltMessage);
          return;
        }

        if (provider === 'google') {
          try {
            const result = await googleTranslationFacade.translate(
              message.request,
              remoteController.signal,
            );
            sendResponse({
              type: 'llt.translate.result',
              requestId: message.requestId,
              result,
            } satisfies LltMessage);
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
              sendResponse({
                type: 'llt.translate.error',
                requestId: message.requestId,
                error: { code: 'engine_failure', message: 'Translation cancelled' },
              } satisfies LltMessage);
            } else {
              const error =
                err instanceof TranslationFacadeError
                  ? err
                  : new TranslationFacadeError(
                      'engine_failure',
                      err instanceof Error ? err.message : 'Google translation failed',
                    );
              sendResponse({
                type: 'llt.translate.error',
                requestId: message.requestId,
                error: { code: error.code, message: error.message },
              } satisfies LltMessage);
            }
          } finally {
            remoteTranslateAborts.delete(message.requestId);
          }
          return;
        }

        remoteTranslateAborts.delete(message.requestId);

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
          sendResponse(errorMsg);
          return;
        }

        const status = await modelPackStore.getStatus(pack.id);
        lltLog('bg', 'model pack status', pack.id, status);
        if (status !== 'ready') {
          const errorMsg: LltMessage = {
            type: 'llt.translate.error',
            requestId: message.requestId,
            error: {
              code: 'model_pack_missing',
              message: 'Install the translation model pack to translate offline.',
            },
          };
          sendResponse(errorMsg);
          return;
        }

        lltLog('bg', 'offscreen translate…');
        const response = await sendToOffscreen({
          type: 'llt.offscreen.translate',
          request: message.request,
          requestId: message.requestId,
        });
        lltLog('bg', 'offscreen ←', response);

        if (response.ok && 'result' in response) {
          const resultMsg: LltMessage = {
            type: 'llt.translate.result',
            requestId: message.requestId,
            result: response.result,
          };
          sendResponse(resultMsg);
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
        sendResponse(errorMsg);
      }
    } catch (err) {
      if (message.type === 'llt.translate') {
        remoteTranslateAborts.delete(message.requestId);
      }
      const error = err instanceof Error ? err.message : 'Background failure';
      lltError('bg', 'handler failed', error);
      sendResponse({ ok: false, error });
    }
  })();

  return true;
});

lltLog('bg', 'service worker loaded');
