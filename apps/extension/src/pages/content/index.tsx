import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './style.css?inline';
import {
  TranslationPopover,
  type AnkiAddState,
  type AnkiViewState,
  type PopoverState,
  type PronunciationControlState,
} from '@src/components/TranslationPopover';
import { extractTextTarget } from '@src/lib/extract-text-target';
import { createProductTranslationFacade } from '@src/lib/product-translator';
import { TranslationFacadeError } from '@src/lib/translation-facade';
import { getLanguagePair, getHotkey } from '@src/lib/storage';
import {
  requestModelPackInstall,
} from '@src/lib/messaging-translation-engine';
import {
  formatApproxSize,
  getModelPackForLanguagePair,
} from '@src/lib/model-pack-registry';
import { getWordAtRange } from '@src/lib/word-at-caret';
import type { LltMessage } from '@src/lib/extension-messages';
import { lltError, lltLog } from '@src/lib/debug-log';
import { requestViewInAnki } from '@src/lib/messaging-anki';
import {
  requestAddToAnkiWithPronunciation,
  requestPronunciationCancel,
  requestPronunciationPlay,
  requestPronunciationPrepare,
  requestPronunciationStop,
  requestSpeechModelPackInstall,
} from '@src/lib/messaging-pronunciation';
import type { PronunciationRequest } from '@src/lib/audio-tts-provider';
import { registerHoldHotkey } from '@src/lib/hold-hotkey';
import { readPageTextSource, type PageTextSource } from '@src/lib/page-text-source';
import { handleTranslationTrigger } from '@src/lib/translation-trigger';
import { requestOpenExtensionOptions } from '@src/lib/open-extension-options';
import { formatApproxSize as formatSpeechSize } from '@src/lib/speech-model-pack-registry';

const host = document.createElement('div');
host.id = '__llt-root';
host.style.all = 'initial';
document.body.appendChild(host);

const shadowRoot = host.attachShadow({ mode: 'open' });

const styleEl = document.createElement('style');
styleEl.textContent = styles;
shadowRoot.appendChild(styleEl);

const mountPoint = document.createElement('div');
shadowRoot.appendChild(mountPoint);

const root = createRoot(mountPoint);
const translateFacade = createProductTranslationFacade();

if (import.meta.hot) {
  import.meta.hot.accept('./style.css?inline', mod => {
    if (mod?.default) styleEl.textContent = mod.default;
  });
}

interface PopoverData {
  state: PopoverState;
  position: { x: number; y: number };
  /** Context sentence saved to Anki, but never sent to the translation engine. */
  contextSentence: string | null;
  packIdForInstall: string | null;
  ankiState: AnkiAddState;
  ankiViewState: AnkiViewState;
  ankiError: string | null;
  ankiNoteId: number | null;
  pronunciationRequestId: string | null;
  pronunciationState: PronunciationControlState | null;
  pronunciationError: string | null;
  pronunciationApproxSizeBytes?: number;
  pronunciationArtifactKey?: string;
  pronunciationRequest?: PronunciationRequest;
  speechPackIdForInstall?: string;
}

function ContentApp() {
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hotkeyRef = useRef<string>('Alt');
  const hotkeyLoadedRef = useRef(false);
  const contextRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    getHotkey().then(k => {
      hotkeyRef.current = k;
      hotkeyLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown) {
      const msg = message as LltMessage;
      if (msg.type !== 'llt.modelPack.changed') return;
      setPopover(prev => {
        if (!prev || prev.packIdForInstall !== msg.packId) return prev;
        if (msg.status === 'ready') {
          return {
            ...prev,
            state: {
              kind: 'error',
              message: 'Model pack installed. Hold the hotkey again to translate.',
              code: 'model_pack_missing',
            },
          };
        }
        if (msg.status === 'failed') {
          return {
            ...prev,
            state: {
              kind: 'error',
              message: msg.errorMessage ?? 'Model pack download failed',
              code: 'model_pack_missing',
            },
          };
        }
        return prev;
      });
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const readCurrentSource = useCallback(async () => {
    let pageUrl: URL | undefined;
    try {
      pageUrl = new URL(window.top?.location.href ?? window.location.href);
    } catch {
      // Cross-origin frames fall back to their own URL inside the source reader.
    }

    return readPageTextSource({
      window,
      document,
      pageUrl,
      pointer: pointerRef.current ?? undefined,
      clipboard: navigator.clipboard
        ? {
            readText: () => navigator.clipboard.readText(),
            writeText: text => navigator.clipboard.writeText(text),
          }
        : undefined,
      copySelection: () => document.execCommand('copy'),
    });
  }, []);

  const showSource = useCallback(async (source: PageTextSource) => {
    const range = source.range;
    const { word, sentence } = range
      ? getWordAtRange(range)
      : { word: null, sentence: null };
    const target = extractTextTarget(source.text, word, sentence);
    lltLog('content', 'text target', {
      source: source.kind,
      selectionText: source.text.slice(0, 120),
      word,
      sentence: sentence?.slice(0, 120) ?? null,
      target,
    });
    if (!target) return;

    contextRef.current = target.context;
    const sourceRect = range?.getClientRects()[0] ?? source.rect;
    const x = sourceRect?.left ?? pointerRef.current?.x ?? 100;
    const y = sourceRect ? sourceRect.bottom + 8 : (pointerRef.current?.y ?? 100) + 8;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const pair = await getLanguagePair();
    const pack = getModelPackForLanguagePair(pair);

    setPopover({
      state: { kind: 'loading' },
      position: { x, y },
      contextSentence: target.context,
      packIdForInstall: pack?.id ?? null,
      ankiState: 'idle',
      ankiViewState: 'idle',
      ankiError: null,
      ankiNoteId: null,
      pronunciationRequestId: null,
      pronunciationState: null,
      pronunciationError: null,
    });

    try {
      const data = await translateFacade.translate(
        { text: target.text, from_code: pair.from_code, to_code: pair.to_code },
        controller.signal,
      );
      const pronunciationRequestId = crypto.randomUUID();
      setPopover(prev =>
        prev
          ? {
              ...prev,
              state: { kind: 'success', data },
              contextSentence: contextRef.current,
              pronunciationRequestId,
              pronunciationState: data.can_add_to_anki ? 'preparing' : null,
              pronunciationError: null,
            }
          : null,
      );

      if (data.can_add_to_anki) {
        void requestPronunciationPrepare(pronunciationRequestId, data).then(response => {
          setPopover(prev => {
            if (
              !prev ||
              prev.pronunciationRequestId !== pronunciationRequestId ||
              prev.state.kind !== 'success'
            ) {
              return prev;
            }
            if (!response.ok) {
              return {
                ...prev,
                pronunciationState: 'failed',
                pronunciationError: response.error,
              };
            }
            return {
              ...prev,
              pronunciationState: response.uiState,
              pronunciationError: response.errorMessage ?? null,
              pronunciationApproxSizeBytes: response.approxSizeBytes,
              pronunciationArtifactKey: response.artifactKey,
              speechPackIdForInstall: response.speechModelPackId,
              pronunciationRequest: response.pronunciationRequest,
            };
          });
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof TranslationFacadeError) {
        setPopover(prev =>
          prev
            ? {
                ...prev,
                state: { kind: 'error', message: err.message, code: err.code },
              }
            : null,
        );
        return;
      }
      setPopover(prev =>
        prev ? { ...prev, state: { kind: 'error', message: 'Translation failed' } } : null,
      );
    }
  }, []);

  useEffect(() => {
    if (window.top !== window) return;

    function onFrameTextSource(message: unknown) {
      const msg = message as LltMessage;
      if (msg.type !== 'llt.frameTextSource') return;
      void showSource({
        text: msg.text,
        kind: msg.sourceKind,
        range: null,
        rect: null,
      });
    }

    chrome.runtime.onMessage.addListener(onFrameTextSource);
    return () => chrome.runtime.onMessage.removeListener(onFrameTextSource);
  }, [showSource]);

  const hidePopover = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const requestId = popover?.pronunciationRequestId;
    if (requestId) {
      void requestPronunciationCancel(requestId);
    }
    void requestPronunciationStop();
    setPopover(null);
  }, [popover?.pronunciationRequestId]);

  const handleInstallModelPack = useCallback(async () => {
    if (!popover?.packIdForInstall) return;
    const pack = getModelPackForLanguagePair(await getLanguagePair());
    const sizeLabel = pack ? formatApproxSize(pack.approxSizeBytes) : '';
    const ok = window.confirm(
      `Download the offline translation model pack${sizeLabel ? ` (${sizeLabel})` : ''}? Selection text stays on your device.`,
    );
    if (!ok) return;

    setPopover(prev =>
      prev
        ? {
            ...prev,
            state: {
              kind: 'error',
              code: 'model_pack_missing',
              message: 'Downloading model pack…',
            },
          }
        : null,
    );
    try {
      await requestModelPackInstall(popover.packIdForInstall);
    } catch {
      setPopover(prev =>
        prev
          ? {
              ...prev,
              state: {
                kind: 'error',
                code: 'model_pack_missing',
                message: 'Could not start model pack download.',
              },
            }
          : null,
      );
    }
  }, [popover?.packIdForInstall]);

  const handleRetryPronunciation = useCallback(() => {
    if (!popover || popover.state.kind !== 'success' || !popover.pronunciationRequestId) return;
    const { data } = popover.state;
    const requestId = popover.pronunciationRequestId;
    setPopover(prev =>
      prev ? { ...prev, pronunciationState: 'preparing', pronunciationError: null } : null,
    );
    void requestPronunciationPrepare(requestId, data).then(response => {
      setPopover(prev => {
        if (!prev || prev.pronunciationRequestId !== requestId) return prev;
        if (!response.ok) {
          return {
            ...prev,
            pronunciationState: 'failed',
            pronunciationError: response.error,
          };
        }
        return {
          ...prev,
          pronunciationState: response.uiState,
          pronunciationError: response.errorMessage ?? null,
          pronunciationApproxSizeBytes: response.approxSizeBytes,
          pronunciationArtifactKey: response.artifactKey,
          speechPackIdForInstall: response.speechModelPackId,
        };
      });
    });
  }, [popover]);

  const handleInstallSpeechPack = useCallback(async () => {
    if (!popover?.speechPackIdForInstall) return;
    const sizeLabel = popover.pronunciationApproxSizeBytes
      ? formatSpeechSize(popover.pronunciationApproxSizeBytes)
      : '';
    const ok = window.confirm(
      `Download the speech model pack${sizeLabel ? ` (${sizeLabel})` : ''}? Selected text stays on your device.`,
    );
    if (!ok) return;
    setPopover(prev =>
      prev ? { ...prev, pronunciationState: 'preparing', pronunciationError: null } : null,
    );
    const install = await requestSpeechModelPackInstall(popover.speechPackIdForInstall);
    if (!install.ok) {
      setPopover(prev =>
        prev
          ? {
              ...prev,
              pronunciationState: 'failed',
              pronunciationError: install.error ?? 'Speech model pack download failed.',
            }
          : null,
      );
      return;
    }
    handleRetryPronunciation();
  }, [popover, handleRetryPronunciation]);

  const handleAddToAnki = useCallback(async () => {
    if (!popover || popover.state.kind !== 'success') return;

    const { data } = popover.state;
    setPopover(prev =>
      prev
        ? {
            ...prev,
            ankiState: 'adding',
            ankiError: null,
          }
        : null,
    );

    try {
      if (popover.pronunciationState === 'pack_missing' && popover.speechPackIdForInstall) {
        const sizeLabel = popover.pronunciationApproxSizeBytes
          ? formatSpeechSize(popover.pronunciationApproxSizeBytes)
          : '';
        const ok = window.confirm(
          `Download the speech model pack${sizeLabel ? ` (${sizeLabel})` : ''} to add pronunciation to Anki? Selected text stays on your device.`,
        );
        if (!ok) {
          setPopover(prev => (prev ? { ...prev, ankiState: 'idle' } : null));
          return;
        }
        await requestSpeechModelPackInstall(popover.speechPackIdForInstall);
      }

      const addResult = await requestAddToAnkiWithPronunciation(
        {
          textFrom: data.source_text,
          textTo: data.translated_text,
          sentence: popover.contextSentence ?? data.source_text,
        },
        {
          pronunciationRequest: popover.pronunciationRequest,
          artifactKey: popover.pronunciationArtifactKey,
        },
      );
      setPopover(prev =>
        prev?.state.kind === 'success' && prev.state.data === data
          ? {
              ...prev,
              ankiState: addResult.status === 'synced' ? 'added' : 'queued',
              ankiViewState: 'idle',
              ankiError: null,
              ankiNoteId: addResult.status === 'synced' ? addResult.noteId : null,
            }
          : null,
      );
    } catch (err) {
      setPopover(prev =>
        prev?.state.kind === 'success' && prev.state.data === data
          ? {
              ...prev,
              ankiState: 'error',
              ankiError: err instanceof Error ? err.message : 'Could not add the card to Anki.',
            }
          : null,
      );
    }
  }, [popover]);

  const handlePlayPronunciation = useCallback(async () => {
    if (!popover?.pronunciationArtifactKey) return;
    setPopover(prev => (prev ? { ...prev, pronunciationState: 'playing' } : null));
    const response = await requestPronunciationPlay(popover.pronunciationArtifactKey);
    if (!response.ok) {
      setPopover(prev =>
        prev
          ? {
              ...prev,
              pronunciationState: 'failed',
              pronunciationError: response.error,
            }
          : null,
      );
      return;
    }
    setPopover(prev =>
      prev?.pronunciationState === 'playing' ? { ...prev, pronunciationState: 'stopped' } : prev,
    );
  }, [popover?.pronunciationArtifactKey]);

  const handleStopPronunciation = useCallback(() => {
    void requestPronunciationStop();
    setPopover(prev =>
      prev?.pronunciationState === 'playing' ? { ...prev, pronunciationState: 'stopped' } : prev,
    );
  }, []);

  const handleViewInAnki = useCallback(async () => {
    if (!popover?.ankiNoteId) return;
    const noteId = popover.ankiNoteId;

    setPopover(prev =>
      prev
        ? {
            ...prev,
            ankiViewState: 'opening',
            ankiError: null,
          }
        : null,
    );

    try {
      await requestViewInAnki(noteId);
      setPopover(prev =>
        prev?.ankiNoteId === noteId
          ? {
              ...prev,
              ankiViewState: 'idle',
              ankiError: null,
            }
          : null,
      );
    } catch (err) {
      setPopover(prev =>
        prev?.ankiNoteId === noteId
          ? {
              ...prev,
              ankiViewState: 'error',
              ankiError: err instanceof Error ? err.message : 'Could not open the card in Anki.',
            }
          : null,
      );
    }
  }, [popover?.ankiNoteId]);

  useEffect(() => {
    return registerHoldHotkey(window, {
      getHotkey: () => hotkeyRef.current,
      isReady: () => hotkeyLoadedRef.current,
      onPress: () => {
        void handleTranslationTrigger({
          isTopFrame: window.top === window,
          readSource: readCurrentSource,
          showSource,
          relaySource: async source => {
            await chrome.runtime.sendMessage({
              type: 'llt.frameTextSource',
              text: source.text,
              sourceKind: source.kind,
            } satisfies LltMessage);
          },
        });
      },
    });
  }, [readCurrentSource, showSource]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    }

    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove, true);
  }, []);

  useEffect(() => {
    if (!popover) return;

    function handlePointerDown(e: PointerEvent) {
      if (e.composedPath().includes(host)) return;
      hidePopover();
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [popover, hidePopover]);

  if (!popover) return null;

  return (
    <TranslationPopover
      state={popover.state}
      position={popover.position}
      onAddToAnki={popover.state.kind === 'success' ? handleAddToAnki : undefined}
      onViewInAnki={popover.ankiNoteId ? handleViewInAnki : undefined}
      ankiState={popover.ankiState}
      ankiViewState={popover.ankiViewState}
      ankiError={popover.ankiError}
      pronunciationState={popover.pronunciationState}
      pronunciationError={popover.pronunciationError}
      pronunciationApproxSizeBytes={popover.pronunciationApproxSizeBytes}
      onPlayPronunciation={() => void handlePlayPronunciation()}
      onStopPronunciation={handleStopPronunciation}
      onRetryPronunciation={handleRetryPronunciation}
      onInstallSpeechPack={() => void handleInstallSpeechPack()}
      onOpenSettings={() => {
        void requestOpenExtensionOptions().catch(error => {
          lltError('content', 'Could not open extension settings', error);
        });
      }}
      onInstallModelPack={
        popover.state.kind === 'error' && popover.state.code === 'model_pack_missing'
          ? handleInstallModelPack
          : undefined
      }
    />
  );
}

root.render(<ContentApp />);
