import React from 'react';
import type { TranslateResponse } from '@package/shared';
import {
  AnkiActions,
  type AnkiAddState,
  type AnkiViewState,
} from '../../components/AnkiActions';
import {
  PronunciationControl,
  type PronunciationControlState,
} from '../../components/PronunciationControl';
import { SettingsAction } from '../../components/SettingsAction';

interface PopupTranslationResultProps {
  result: TranslateResponse;
  ankiState: AnkiAddState;
  ankiViewState: AnkiViewState;
  ankiError: string | null;
  onAddToAnki: () => void;
  onViewInAnki: () => void;
  onOpenSettings: () => void;
  pronunciationState?: PronunciationControlState | null;
  pronunciationError?: string | null;
  pronunciationApproxSizeBytes?: number;
  translatedPronunciationState?: PronunciationControlState | null;
  translatedPronunciationError?: string | null;
  onPlayPronunciation?: () => void;
  onStopPronunciation?: () => void;
  onRetryPronunciation?: () => void;
  onInstallSpeechPack?: () => void;
  onPlayTranslatedPronunciation?: () => void;
  onStopTranslatedPronunciation?: () => void;
  onRetryTranslatedPronunciation?: () => void;
}

export function PopupTranslationResult({
  result,
  ankiState,
  ankiViewState,
  ankiError,
  onAddToAnki,
  onViewInAnki,
  onOpenSettings,
  pronunciationState = null,
  pronunciationError,
  pronunciationApproxSizeBytes,
  translatedPronunciationState = null,
  translatedPronunciationError,
  onPlayPronunciation,
  onStopPronunciation,
  onRetryPronunciation,
  onInstallSpeechPack,
  onPlayTranslatedPronunciation,
  onStopTranslatedPronunciation,
  onRetryTranslatedPronunciation,
}: PopupTranslationResultProps) {
  return (
    <section className="bg-white p-4">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
          Translation
        </p>
        <div className="flex items-center gap-1">
          {translatedPronunciationState && (
            <PronunciationControl
              state={translatedPronunciationState}
              contentLabel="translated text"
              errorMessage={translatedPronunciationError}
              onPlay={onPlayTranslatedPronunciation}
              onStop={onStopTranslatedPronunciation}
              onRetry={onRetryTranslatedPronunciation}
            />
          )}
          {result.can_add_to_anki && (
            <AnkiActions
              addState={ankiState}
              viewState={ankiViewState}
              onAdd={onAddToAnki}
              onView={onViewInAnki}
            />
          )}
          <SettingsAction onOpen={onOpenSettings} />
        </div>
      </div>
      <p className="mt-1 text-[15px] font-medium leading-relaxed">{result.translated_text}</p>

      {(ankiState === 'error' || ankiViewState === 'error') && ankiError && (
        <p className="mt-2 text-xs leading-relaxed text-rose-600" role="alert">
          {ankiError}
        </p>
      )}

      {ankiState === 'queued' && (
        <p className="mt-2 text-xs leading-relaxed text-amber-700" role="status">
          Saved locally. It will sync when Anki is open.
        </p>
      )}

      <div className="my-3 border-t border-slate-200" />
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
          Original
        </p>
        {pronunciationState && (
          <PronunciationControl
            state={pronunciationState}
            contentLabel="original text"
            approxSizeBytes={pronunciationApproxSizeBytes}
            errorMessage={pronunciationError}
            onPlay={onPlayPronunciation}
            onStop={onStopPronunciation}
            onRetry={onRetryPronunciation}
            onInstallSpeechPack={onInstallSpeechPack}
          />
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{result.source_text}</p>
    </section>
  );
}
