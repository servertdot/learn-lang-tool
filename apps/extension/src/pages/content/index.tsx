import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './style.css?inline';
import { TranslationPopover, type PopoverState } from '@src/components/TranslationPopover';
import { extractTextTarget } from '@src/lib/extract-text-target';
import { translate, TranslationApiError } from '@src/lib/translation-api-client';
import { getLanguagePair, getHotkey } from '@src/lib/storage';
import { normalizeText } from '@src/lib/normalize-text';

// ── DOM host ──────────────────────────────────────────────────────────────────
// Styles must be injected into the shadow root — Vite's default CSS import
// puts them in document.head, which cannot pierce Shadow DOM.

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

if (import.meta.hot) {
  import.meta.hot.accept('./style.css?inline', mod => {
    if (mod?.default) styleEl.textContent = mod.default;
  });
}

// ── Sentence extraction ───────────────────────────────────────────────────────

function extractSentenceAround(text: string, wordOffset: number): string {
  // Split on sentence-ending punctuation; find the sentence containing offset
  const sentenceRe = /[^.!?]*[.!?]*/g;
  let match: RegExpExecArray | null;
  let accumulated = 0;
  while ((match = sentenceRe.exec(text)) !== null) {
    const segment = match[0];
    accumulated += segment.length;
    if (accumulated >= wordOffset) {
      return normalizeText(segment) || normalizeText(text);
    }
  }
  return normalizeText(text);
}

// ── Word / sentence detection ─────────────────────────────────────────────────

function getWordUnderCursor(): { word: string | null; sentence: string | null } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { word: null, sentence: null };

  const range = sel.getRangeAt(0);

  // Walk up to find first text node when caret lands on an element node
  let node: Node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    const firstText = node.firstChild;
    if (!firstText || firstText.nodeType !== Node.TEXT_NODE) return { word: null, sentence: null };
    node = firstText;
  }

  const text = node.textContent ?? '';
  const offset = range.startOffset;

  let start = offset;
  let end = offset;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;

  const word = text.slice(start, end).trim() || null;

  const el = (node as Text).parentElement;
  const fullText = el?.textContent ?? '';
  // Approximate absolute offset within element text for sentence extraction
  const absoluteOffset = fullText.indexOf(text) + offset;
  const sentence = fullText ? extractSentenceAround(fullText, absoluteOffset) : null;

  return { word, sentence };
}

// ── Content script app ────────────────────────────────────────────────────────

interface PopoverData {
  state: PopoverState;
  position: { x: number; y: number };
}

function ContentApp() {
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // hotkey is loaded async; ref lets keydown handler always see latest value
  const hotkeyRef = useRef<string>('Alt');
  const hotkeyLoadedRef = useRef(false);

  useEffect(() => {
    getHotkey().then(k => {
      hotkeyRef.current = k;
      hotkeyLoadedRef.current = true;
    });
  }, []);

  const showPopover = useCallback(async () => {
    const sel = window.getSelection();
    const selectionText = sel?.toString() ?? '';

    const { word, sentence } = getWordUnderCursor();
    const target = extractTextTarget(selectionText, word, sentence);
    if (!target) return;

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

    setPopover({ state: { kind: 'loading' }, position: { x, y } });

    try {
      const pair = await getLanguagePair();
      const data = await translate(
        { text: target.text, from_code: pair.from_code, to_code: pair.to_code },
        controller.signal,
      );
      setPopover(prev => prev ? { ...prev, state: { kind: 'success', data } } : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof TranslationApiError ? err.message : 'Translation failed';
      setPopover(prev => prev ? { ...prev, state: { kind: 'error', message } } : null);
    }
  }, []);

  const hidePopover = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPopover(null);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore key-repeat events to avoid re-triggering on hold
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

  // Stay open after hotkey release; dismiss only on outside click
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
    />
  );
}

root.render(<ContentApp />);
