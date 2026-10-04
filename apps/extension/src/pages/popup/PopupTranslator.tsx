import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_TRANSLATION_TEXT_LENGTH } from '@package/shared';
import type { LanguagePair } from '@package/shared';
import { SettingsAction } from '@src/components/SettingsAction';
import { createProductTranslationFacade } from '@src/lib/product-translator';
import { useLanguagePair } from '@src/lib/use-language-pair';
import { LanguagePairSelect } from '@src/components/LanguagePairSelect';

const translator = createProductTranslationFacade();

interface PopupTranslatorProps {
  initialText?: string;
  onInteract?: () => void;
}

export function PopupTranslator({ initialText = '', onInteract }: PopupTranslatorProps) {
  const [source, setSource] = useState(initialText);
  const [target, setTarget] = useState('');
  const { pair, ready, saving, error: languageError, changePair } = useLanguagePair();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const copyVersionRef = useRef(0);
  const interactedRef = useRef(false);
  const autoTranslatedRef = useRef(false);
  const tooLong = source.length > MAX_TRANSLATION_TEXT_LENGTH;
  const canTranslate = ready && !!source.trim() && !tooLong && !loading && !saving;

  // The page selection arrives asynchronously; manual interaction cancels its import.
  useEffect(() => {
    if (!interactedRef.current) setSource(initialText);
  }, [initialText]);

  useEffect(() => {
    if (ready) sourceRef.current?.focus();
  }, [ready]);

  useEffect(() => () => {
    requestRef.current?.abort();
    copyVersionRef.current += 1;
  }, []);

  const handleInteraction = () => {
    interactedRef.current = true;
    onInteract?.();
  };

  const resetTranslation = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    copyVersionRef.current += 1;
    setTarget('');
    setLoading(false);
    setError(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    resetTranslation();
  }, [pair.from_code, pair.to_code, resetTranslation]);

  const runTranslation = useCallback(async (text: string, languagePair: LanguagePair) => {
    resetTranslation();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const result = await translator.translate({ text, ...languagePair }, controller.signal);
      if (controller.signal.aborted) return;
      setTarget(result.translated_text);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Could not translate. Try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [resetTranslation]);

  useEffect(() => {
    if (!ready || interactedRef.current || autoTranslatedRef.current) return;
    if (!initialText.trim() || initialText.length > MAX_TRANSLATION_TEXT_LENGTH) return;
    autoTranslatedRef.current = true;
    void runTranslation(initialText, pair);
  }, [ready, initialText, pair, runTranslation]);

  const translate = async () => {
    if (!canTranslate) return;
    handleInteraction();
    await runTranslation(source, pair);
  };

  const copy = async () => {
    const version = copyVersionRef.current;
    try {
      await navigator.clipboard.writeText(target);
      if (copyVersionRef.current === version) {
        setCopied(true);
        setError(null);
      }
    } catch {
      if (copyVersionRef.current === version) {
        setError('Could not copy. Select the translation and copy it manually.');
      }
    }
  };
  return (
    <section className="popup-translator p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Translator</h1>
        <SettingsAction onOpen={() => void chrome.runtime.openOptionsPage()} />
      </header>
      <form onChange={handleInteraction} onSubmit={event => { event.preventDefault(); void translate(); }}>
        <LanguagePairSelect
          pair={pair}
          disabled={!ready || saving}
          className="mb-3"
          fieldClassName="text-xs text-zinc-400"
          selectClassName="translator-language mt-1"
          swapClassName="translator-secondary h-9 px-2"
          onChange={next => {
            handleInteraction();
            resetTranslation();
            void changePair(next);
          }}
          onSwap={async () => {
            handleInteraction();
            const nextSource = target || source;
            resetTranslation();
            if (await changePair({ from_code: pair.to_code, to_code: pair.from_code })) {
              setSource(nextSource);
              sourceRef.current?.focus();
            }
          }}
        />
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="translator-source" className="text-xs font-medium text-zinc-400">Source</label>
          <button
            type="button"
            className="translator-secondary px-2 py-1 text-xs"
            disabled={!source}
            onClick={() => { handleInteraction(); resetTranslation(); setSource(''); sourceRef.current?.focus(); }}
          >Clear</button>
        </div>
        <textarea
          ref={sourceRef}
          id="translator-source"
          className="translator-text"
          dir="auto"
          rows={4}
          value={source}
          placeholder="Type or paste text to translate"
          aria-describedby="translator-length"
          aria-invalid={tooLong}
          onChange={event => { resetTranslation(); setSource(event.target.value); }}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void translate();
            }
          }}
        />
        <div className="my-2 flex items-center justify-between gap-2">
          <span id="translator-length" className={`text-[11px] tabular-nums ${tooLong ? 'text-rose-300' : 'text-zinc-500'}`}>
            {source.length} / {MAX_TRANSLATION_TEXT_LENGTH}
          </span>
          <button type="submit" className="translator-submit px-4 py-2 text-xs font-semibold" disabled={!canTranslate}>
            {loading ? 'Translating…' : 'Translate'}
          </button>
        </div>
        <p className="mb-3 text-[10px] text-zinc-500">Ctrl / ⌘ + Enter to translate</p>
      </form>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor="translator-target" className="text-xs font-medium text-zinc-400">Target</label>
        <button type="button" className="translator-secondary px-2 py-1 text-xs" disabled={!target} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        id="translator-target"
        className="translator-text"
        dir="auto"
        rows={4}
        readOnly
        value={target}
        aria-busy={loading}
        placeholder={loading ? 'Translating…' : 'Translation appears here'}
      />
      <p role="status" className="sr-only">{loading ? 'Translating…' : target ? 'Translation ready' : ''}{copied ? '. Copied' : ''}</p>
      {tooLong && <p role="alert" className="mt-2 text-xs text-rose-300">Shorten the text to {MAX_TRANSLATION_TEXT_LENGTH} characters to translate.</p>}
      {(languageError || error) && <p role="alert" className="mt-2 text-xs leading-relaxed text-rose-300">{languageError || error}</p>}
    </section>
  );
}
