import React from 'react';
import type { PronunciationControlState } from './PronunciationControl';

interface AnkiPronunciationStatusProps {
  state?: PronunciationControlState | null;
  onRetry?: () => void;
  onInstallSpeechPack?: () => void;
}

export function AnkiPronunciationStatus({
  state,
  onRetry,
  onInstallSpeechPack,
}: AnkiPronunciationStatusProps) {
  if (!state || state === 'ready' || state === 'stopped' || state === 'playing') return null;

  const failed = state === 'failed' || state === 'unsupported';
  const message = state === 'preparing'
    ? 'Preparing pronunciation for Anki…'
    : state === 'pack_missing'
      ? 'A speech model is needed for Anki pronunciation.'
      : state === 'unsupported'
        ? 'Pronunciation for Anki is unavailable for this language.'
        : 'Couldn’t prepare pronunciation for Anki.';

  return (
    <div
      className={`mt-2 flex items-center justify-between gap-3 text-xs leading-relaxed ${
        failed ? 'text-rose-300' : 'text-amber-300'
      }`}
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span>{message}</span>
      {state === 'failed' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry Anki pronunciation"
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Retry audio
        </button>
      )}
      {state === 'pack_missing' && onInstallSpeechPack && (
        <button
          type="button"
          onClick={onInstallSpeechPack}
          aria-label="Download speech model for Anki pronunciation"
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Download model
        </button>
      )}
    </div>
  );
}
