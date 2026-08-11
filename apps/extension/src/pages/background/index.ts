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
  PronunciationPlaybackResponse,
  PronunciationPrepareResponse,
  SpeechModelPackInstallResponse,
  SpeechModelPackStatusResponse,
} from '@src/lib/extension-messages';
import { createChromeModelPackPersistence } from '@src/lib/model-pack-persistence';
import { createModelPackStore } from '@src/lib/model-pack-store';
import { MODEL_PACK_REGISTRY, getModelPackForLanguagePair } from '@src/lib/model-pack-registry';
import {
  cancelModelPackInstall,
  installModelPackFiles,
} from '@src/lib/model-pack-installer';
import { createChromeSpeechModelPackPersistence } from '@src/lib/speech-model-pack-persistence';
import {
  cancelSpeechModelPackInstall,
  installSpeechModelPackFiles,
} from '@src/lib/speech-model-pack-installer';
import { getSpeechModelPack } from '@src/lib/speech-model-pack-registry';
import { createIndexedDbPronunciationArtifactStore } from '@src/lib/pronunciation-artifact-idb-store';
import {
  cancelPronunciationPrepare,
  discardPronunciationSession,
  fulfillAndSyncAudioQueue,
  playPronunciationArtifact,
  preparePronunciation,
  stopPronunciationPlayback,
} from '@src/lib/pronunciation-runtime';
import { getAnkiAudioFieldNames, createAnkiNote } from '@src/lib/anki';
import { lltError, lltLog } from '@src/lib/debug-log';
import { getAnkiSettings, getTranslationProvider } from '@src/lib/storage';
import { createGoogleTranslationEngine } from '@src/lib/google-translation-engine';
import { createTranslationFacade, TranslationFacadeError } from '@src/lib/translation-facade';
import { MAX_TRANSLATION_TEXT_LENGTH } from '@package/shared';
import {
  addNoteWithAnkiConnect,
  browseNoteWithAnkiConnect,
  findDuplicateNotesWithAnkiConnect,
  findQueuedNoteIdsWithAnkiConnect,
  getCollectionInfoWithAnkiConnect,
  getModelFieldNamesWithAnkiConnect,
  removeAnkiQueueTagWithAnkiConnect,
  isAnkiDuplicateError,
} from '@src/lib/anki-connect';
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
import { enqueueCardWithRequiredAudio } from '@src/lib/pronunciation-workflow';
import { resolveAuthorizedPronunciationTranslationProvider } from '@src/lib/tts-provider-registry';

const OFFSCREEN_URL = 'src/pages/offscreen/index.html';
const OFFSCREEN_REASONS = [
  'WORKERS' as chrome.offscreen.Reason,
  'AUDIO_PLAYBACK' as chrome.offscreen.Reason,
];
const OFFSCREEN_JUSTIFICATION =
  'Run translation, local and remote speech synthesis, and pronunciation audio playback.';

const modelPackStore = createModelPackStore(createChromeModelPackPersistence());
const speechModelPackStore = createModelPackStore(createChromeSpeechModelPackPersistence());
const pronunciationArtifactStore = createIndexedDbPronunciationArtifactStore();
const googleTranslationFacade = createTranslationFacade(createGoogleTranslationEngine(), {
  maxLength: MAX_TRANSLATION_TEXT_LENGTH,
});
const remoteTranslateAborts = new Map<string, AbortController>();
const ANKI_QUEUE_SYNC_ALARM = 'llt.anki.syncQueue';
const ankiQueue = new AnkiQueue(createChromeAnkiQueueStorage());
let ankiQueueSyncPromise: ReturnType<typeof runAnkiQueueSync> | null = null;

const pronunciationRuntime = {
  speechPackStore: speechModelPackStore,
  artifactStore: pronunciationArtifactStore,
  ankiQueue,
  ensureOffscreenDocument,
  sendToOffscreen,
};

async function runAnkiQueueSync() {
  await fulfillAndSyncAudioQueue(pronunciationRuntime).catch(error =>
    lltError('bg', 'Queued pronunciation fulfill failed', error),
  );
  const settings = await getAnkiSettings();
  return syncAnkiQueue(ankiQueue, settings, {
    findNoteIds: findQueuedNoteIdsWithAnkiConnect,
    addNote: (ankiSettings, note, audio) =>
      addNoteWithAnkiConnect(ankiSettings, note, {}, audio),
    removeQueueTag: removeAnkiQueueTagWithAnkiConnect,
    artifactStore: pronunciationArtifactStore,
    audioFieldsForNote: ankiSettings => getAnkiAudioFieldNames(ankiSettings),
    isDuplicateError: isAnkiDuplicateError,
    findDuplicateNotes: findDuplicateNotesWithAnkiConnect,
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
  const runtime = chrome.runtime as typeof chrome.runtime & {
    getContexts?: typeof chrome.runtime.getContexts;
  };
  if (!runtime.getContexts) {
    return typeof document !== 'undefined' &&
      document.querySelector(`iframe[src="${chrome.runtime.getURL(OFFSCREEN_URL)}"]`) !== null;
  }
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });
  return contexts.length > 0;
}

let startingOffscreenDocument: Promise<void> | null = null;

async function startOffscreenDocument(): Promise<void> {
  const offscreen = (chrome as typeof chrome & { offscreen?: typeof chrome.offscreen }).offscreen;
  if (offscreen?.createDocument) {
    await offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: OFFSCREEN_REASONS,
      justification: OFFSCREEN_JUSTIFICATION,
    });
    return;
  }

  // Firefox background scripts run in an extension document and can host the
  // same browser-neutral runtime in a hidden frame.
  if (typeof document !== 'undefined') {
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL(OFFSCREEN_URL);
    frame.hidden = true;
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Could not start the pronunciation runtime.'));
      document.documentElement.appendChild(frame);
    });
    return;
  }

  throw new Error('This browser cannot start the pronunciation runtime.');
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  startingOffscreenDocument ??= startOffscreenDocument();
  const pending = startingOffscreenDocument;
  try {
    await pending;
  } finally {
    if (startingOffscreenDocument === pending) {
      startingOffscreenDocument = null;
    }
  }
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

function broadcastSpeechPackChanged(
  packId: string,
  status: Awaited<ReturnType<typeof speechModelPackStore.getStatus>>,
  errorMessage?: string,
): void {
  const msg: LltMessage = {
    type: 'llt.speechModelPack.changed',
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
    message.type === 'llt.offscreen.synthesize' ||
    message.type === 'llt.offscreen.abortSynthesize' ||
    message.type === 'llt.offscreen.playArtifact' ||
    message.type === 'llt.offscreen.stopPlayback' ||
    message.type === 'llt.translate.result' ||
    message.type === 'llt.translate.error' ||
    message.type === 'llt.pageSelection.get' ||
    message.type === 'llt.modelPack.changed' ||
    message.type === 'llt.modelPack.status' ||
    message.type === 'llt.speechModelPack.changed'
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

      if (message.type === 'llt.speechModelPack.getStatus') {
        try {
          const pack = getSpeechModelPack(message.packId);
          const status = await speechModelPackStore.getStatus(message.packId);
          const state = await speechModelPackStore.getState(message.packId);
          sendResponse({
            ok: true,
            packId: message.packId,
            status,
            errorMessage: state?.errorMessage,
            approxSizeBytes: pack?.approxSizeBytes,
          } satisfies SpeechModelPackStatusResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not read speech model pack status.';
          sendResponse({ ok: false, error } satisfies SpeechModelPackStatusResponse);
        }
        return;
      }

      if (message.type === 'llt.speechModelPack.install') {
        try {
          const pack = getSpeechModelPack(message.packId);
          if (!pack) {
            sendResponse({
              ok: false,
              error: `Unknown speech model pack: ${message.packId}`,
            } satisfies SpeechModelPackInstallResponse);
            return;
          }
          await speechModelPackStore.markDownloading(message.packId);
          broadcastSpeechPackChanged(message.packId, 'downloading');
          await installSpeechModelPackFiles(message.packId);
          await speechModelPackStore.markReady(message.packId);
          broadcastSpeechPackChanged(message.packId, 'ready');
          sendResponse({ ok: true } satisfies SpeechModelPackInstallResponse);
        } catch (err) {
          const aborted =
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err instanceof Error && err.name === 'AbortError');

          if (aborted) {
            await speechModelPackStore.markCancelled(message.packId);
            broadcastSpeechPackChanged(message.packId, 'missing');
            sendResponse({ ok: false, aborted: true } satisfies SpeechModelPackInstallResponse);
            return;
          }

          const error = err instanceof Error ? err.message : 'Speech model pack install failed';
          await speechModelPackStore.markFailed(message.packId, error);
          broadcastSpeechPackChanged(message.packId, 'failed', error);
          sendResponse({ ok: false, error } satisfies SpeechModelPackInstallResponse);
        }
        return;
      }

      if (message.type === 'llt.speechModelPack.cancel') {
        cancelSpeechModelPackInstall();
        await speechModelPackStore.markCancelled(message.packId);
        broadcastSpeechPackChanged(message.packId, 'missing');
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'llt.pronunciation.prepare') {
        try {
          const configuredProvider = await getTranslationProvider();
          const state = await preparePronunciation(
            {
              ...message.input,
              // Google is allowed only when both the active result and the
              // current setting authorize the remote provider.
              translationProvider: resolveAuthorizedPronunciationTranslationProvider(
                message.input.translationProvider,
                configuredProvider,
              ),
            },
            pronunciationRuntime,
          );
          sendResponse({
            ok: true,
            requestId: state.requestId,
            uiState: state.uiState,
            artifactKey: state.artifactKey,
            speechModelPackId: state.speechModelPackId,
            approxSizeBytes: state.approxSizeBytes,
            errorCode: state.errorCode,
            errorMessage: state.errorMessage,
            providerId: state.providerId,
            playbackKind: state.playbackKind,
            pronunciationRequests: state.pronunciationRequests,
            pronunciationRequest: state.pronunciationRequest,
          } satisfies PronunciationPrepareResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not prepare pronunciation.';
          sendResponse({ ok: false, error } satisfies PronunciationPrepareResponse);
        }
        return;
      }

      if (message.type === 'llt.pronunciation.cancel') {
        cancelPronunciationPrepare(message.requestId);
        void sendToOffscreen({
          type: 'llt.offscreen.abortSynthesize',
          requestId: message.requestId,
        }).catch(() => undefined);
        if (message.discardSession) {
          await discardPronunciationSession(message.requestId, pronunciationRuntime);
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'llt.pronunciation.play') {
        try {
          await playPronunciationArtifact(message.artifactKey, pronunciationRuntime);
          sendResponse({ ok: true } satisfies PronunciationPlaybackResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not play pronunciation.';
          sendResponse({ ok: false, error } satisfies PronunciationPlaybackResponse);
        }
        return;
      }

      if (message.type === 'llt.pronunciation.stop') {
        try {
          await stopPronunciationPlayback(pronunciationRuntime);
          sendResponse({ ok: true } satisfies PronunciationPlaybackResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not stop pronunciation.';
          sendResponse({ ok: false, error } satisfies PronunciationPlaybackResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.addNote') {
        try {
          const settings = await getAnkiSettings();
          const note = createAnkiNote(settings, message.content);
          const enqueued = await enqueueCardWithRequiredAudio(
            ankiQueue,
            {
              note,
              pronunciationRequests: message.pronunciationRequests,
              pronunciationRequest: message.pronunciationRequest,
              artifactKey: message.artifactKey,
            },
            pronunciationArtifactStore,
          );
          const itemId = enqueued.itemId;

          await updateAnkiQueueSyncAlarm();
          const syncResult = await syncQueuedAnkiCards();
          const info = await ankiQueue.getInfo();
          await updateAnkiQueueSyncAlarm();
          const noteId = syncResult.noteIds[itemId];
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
            duplicateConflicts: result.duplicateConflicts,
            ...info,
          } satisfies AnkiQueueSyncResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not sync the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueSyncResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.resolveDuplicates') {
        try {
          const queuedItems = new Map((await ankiQueue.list()).map(item => [item.id, item]));
          for (const decision of message.decisions) {
            const item = queuedItems.get(decision.queueItemId);
            if (!item) continue;
            if (decision.action === 'add') {
              await ankiQueue.allowDuplicate(item.id);
            } else {
              await ankiQueue.remove(item.id);
              if (item.artifactKey) {
                await pronunciationArtifactStore.unpin(item.artifactKey);
              }
            }
          }

          const result = await syncQueuedAnkiCards();
          const info = await ankiQueue.getInfo();
          await updateAnkiQueueSyncAlarm();
          sendResponse({
            ok: true,
            syncedCount: result.syncedCount,
            duplicateConflicts: result.duplicateConflicts,
            ...info,
          } satisfies AnkiQueueSyncResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not resolve Anki duplicates.';
          sendResponse({ ok: false, error } satisfies AnkiQueueSyncResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.export') {
        try {
          const settings = await getAnkiSettings();
          const exported = exportAnkiQueue(
            await ankiQueue.list(),
            message.format,
            new Date(),
            { [settings.modelName]: Object.keys(settings.fieldMappings) },
          );
          sendResponse({ ok: true, ...exported } satisfies AnkiQueueExportResponse);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Could not export the Anki queue.';
          sendResponse({ ok: false, error } satisfies AnkiQueueExportResponse);
        }
        return;
      }

      if (message.type === 'llt.anki.queue.clear') {
        try {
          const cleared = await ankiQueue.clear();
          const referenced = new Set(
            cleared.map(item => item.artifactKey).filter((key): key is string => Boolean(key)),
          );
          // Clear removes all queue refs; drop unreferenced pronunciation artifacts.
          await pronunciationArtifactStore.deleteUnreferenced(new Set());
          void referenced;
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
