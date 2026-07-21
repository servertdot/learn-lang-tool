import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './style.css?inline';
import { TranslationPopover, type PopoverState } from '@src/components/TranslationPopover';
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
import { lltLog } from '@src/lib/debug-log';

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
  /** Context sentence for a future Anki track — not sent to the translation engine. */
  contextSentence: string | null;
  packIdForInstall: string | null;
}

function ContentApp() {
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hotkeyRef = useRef<string>('Alt');
  const hotkeyLoadedRef = useRef(false);
  const contextRef = useRef<string | null>(null);

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

  const showPopover = useCallback(async () => {
    const sel = window.getSelection();
    const selectionText = sel?.toString() ?? '';
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const { word, sentence } = range
      ? getWordAtRange(range)
      : { word: null, sentence: null };
    const target = extractTextTarget(selectionText, word, sentence);
    lltLog('content', 'text target', {
      selectionText: selectionText.slice(0, 120),
      word,
      sentence: sentence?.slice(0, 120) ?? null,
      target,
    });
    if (!target) return;

    contextRef.current = target.context;
    let x = 100;
    let y = 100;
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getClientRects()[0];
      if (rect) {
        x = rect.left;
        y = rect.bottom + 8;
      }
    }

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
    });

    try {
      const data = await translateFacade.translate(
        { text: target.text, from_code: pair.from_code, to_code: pair.to_code },
        controller.signal,
      );
      setPopover(prev =>
        prev
          ? {
              ...prev,
              state: { kind: 'success', data },
              contextSentence: contextRef.current,
            }
          : null,
      );
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

  const hidePopover = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPopover(null);
  }, []);

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (!hotkeyLoadedRef.current) return;
      if (e.key === hotkeyRef.current) {
        e.preventDefault();
        showPopover();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPopover]);

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
      onInstallModelPack={
        popover.state.kind === 'error' && popover.state.code === 'model_pack_missing'
          ? handleInstallModelPack
          : undefined
      }
    />
  );
}

root.render(<ContentApp />);
