import React, { useEffect, useState } from 'react';
import type { TranslateResponse } from '@package/shared';
import { requestAddToAnki, requestViewInAnki } from '@src/lib/messaging-anki';
import { createProductTranslationFacade } from '@src/lib/product-translator';
import { getLanguagePair } from '@src/lib/storage';
import { takePendingSelection } from '@src/lib/pending-selection';
import {
  PopupTranslationResult,
} from './PopupTranslationResult';
import type { AnkiAddState, AnkiViewState } from '@src/components/AnkiActions';

type PopupState =
  | { kind: 'loading'; sourceText: string }
  | { kind: 'success'; result: TranslateResponse }
  | { kind: 'error'; message: string; sourceText: string }
  | { kind: 'empty' };

const translateFacade = createProductTranslationFacade();

export default function Popup() {
  const [state, setState] = useState<PopupState>({ kind: 'loading', sourceText: '' });
  const [ankiState, setAnkiState] = useState<AnkiAddState>('idle');
  const [ankiViewState, setAnkiViewState] = useState<AnkiViewState>('idle');
  const [ankiError, setAnkiError] = useState<string | null>(null);
  const [ankiNoteId, setAnkiNoteId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const pending = await takePendingSelection();
      await chrome.action.setBadgeText({ text: '' });
      if (!pending) {
        setState({ kind: 'empty' });
        return;
      }

      setState({ kind: 'loading', sourceText: pending.text });
      try {
        const pair = await getLanguagePair();
        const result = await translateFacade.translate(
          {
            text: pending.text,
            from_code: pair.from_code,
            to_code: pair.to_code,
          },
          controller.signal,
        );
        setState({ kind: 'success', result });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Translation failed',
          sourceText: pending.text,
        });
      }
    })();

    return () => controller.abort();
  }, []);

  const handleAddToAnki = async () => {
    if (state.kind !== 'success') return;

    const { result } = state;
    setAnkiState('adding');
    setAnkiError(null);

    try {
      const addResult = await requestAddToAnki({
        textFrom: result.source_text,
        textTo: result.translated_text,
        sentence: result.source_text,
      });
      setAnkiNoteId(addResult.status === 'synced' ? addResult.noteId : null);
      setAnkiState(addResult.status === 'synced' ? 'added' : 'queued');
      setAnkiViewState('idle');
    } catch (error) {
      setAnkiState('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not add the card to Anki.');
    }
  };

  const handleViewInAnki = async () => {
    if (ankiNoteId === null) return;

    setAnkiViewState('opening');
    setAnkiError(null);

    try {
      await requestViewInAnki(ankiNoteId);
      setAnkiViewState('idle');
    } catch (error) {
      setAnkiViewState('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not open the card in Anki.');
    }
  };

  return (
    <main className="min-h-[180px] bg-slate-50 p-4 text-slate-950">
      <header className="mb-4 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          L
        </span>
        <div>
          <h1 className="text-sm font-semibold">Learn Lang Tool</h1>
          <p className="text-[11px] text-slate-500">Selection translation</p>
        </div>
      </header>

      {state.kind === 'empty' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium">Translate text from any page</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Select text, right-click it, then choose <strong>Translate selection</strong>. This
            also works in the browser PDF viewer.
          </p>
        </section>
      )}

      {state.kind === 'loading' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" role="status">
          <p className="text-sm font-semibold text-indigo-700">Translating…</p>
          {state.sourceText && (
            <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-slate-500">
              {state.sourceText}
            </p>
          )}
        </section>
      )}

      {state.kind === 'success' && (
        <PopupTranslationResult
          result={state.result}
          ankiState={ankiState}
          ankiViewState={ankiViewState}
          ankiError={ankiError}
          onAddToAnki={() => void handleAddToAnki()}
          onViewInAnki={() => void handleViewInAnki()}
        />
      )}

      {state.kind === 'error' && (
        <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm" role="alert">
          <p className="text-sm font-semibold text-rose-700">Couldn’t translate</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{state.message}</p>
          <button
            type="button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Open settings
          </button>
        </section>
      )}
    </main>
  );
}
