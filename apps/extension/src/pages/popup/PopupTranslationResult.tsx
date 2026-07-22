import React from 'react';
import type { TranslateResponse } from '@package/shared';
import {
  AnkiActions,
  type AnkiAddState,
  type AnkiViewState,
} from '../../components/AnkiActions';

interface PopupTranslationResultProps {
  result: TranslateResponse;
  ankiState: AnkiAddState;
  ankiViewState: AnkiViewState;
  ankiError: string | null;
  onAddToAnki: () => void;
  onViewInAnki: () => void;
}

export function PopupTranslationResult({
  result,
  ankiState,
  ankiViewState,
  ankiError,
  onAddToAnki,
  onViewInAnki,
}: PopupTranslationResultProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
          Translation
        </p>
        {result.can_add_to_anki && (
          <AnkiActions
            addState={ankiState}
            viewState={ankiViewState}
            onAdd={onAddToAnki}
            onView={onViewInAnki}
          />
        )}
      </div>
      <p className="mt-1 text-[15px] font-medium leading-relaxed">{result.translated_text}</p>

      {(ankiState === 'error' || ankiViewState === 'error') && ankiError && (
        <p className="mt-2 text-xs leading-relaxed text-rose-600" role="alert">
          {ankiError}
        </p>
      )}

      <div className="my-3 border-t border-slate-200" />
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
        Original
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{result.source_text}</p>
    </section>
  );
}
