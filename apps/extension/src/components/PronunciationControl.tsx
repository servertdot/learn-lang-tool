import React from 'react';
import type { PronunciationUiState } from '../lib/pronunciation-workflow';
import { formatApproxSize } from '../lib/model-pack-registry';

export type PronunciationControlState = PronunciationUiState;

interface PronunciationControlProps {
  state: PronunciationControlState;
  approxSizeBytes?: number;
  errorMessage?: string | null;
  onPlay?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onInstallSpeechPack?: () => void;
}

function accessibleName(state: PronunciationControlState): string {
  switch (state) {
    case 'preparing':
      return 'Preparing pronunciation';
    case 'ready':
    case 'stopped':
      return 'Play pronunciation';
    case 'playing':
      return 'Stop pronunciation';
    case 'failed':
      return 'Retry pronunciation';
    case 'pack_missing':
      return 'Download speech model';
    case 'unsupported':
      return 'Pronunciation unavailable';
    default:
      return 'Pronunciation';
  }
}

export function PronunciationControl({
  state,
  approxSizeBytes,
  errorMessage,
  onPlay,
  onStop,
  onRetry,
  onInstallSpeechPack,
}: PronunciationControlProps) {
  const isPreparing = state === 'preparing';
  const isPlaying = state === 'playing';
  const canPlay = state === 'ready' || state === 'stopped';
  const showStatusText = isPreparing || state === 'failed' || state === 'unsupported' || state === 'pack_missing';

  return (
    <div className="flex items-center gap-2">
      {showStatusText && (
        <span
          className={`text-[10px] leading-none ${
            state === 'failed' || state === 'unsupported' ? 'text-rose-600' : 'text-slate-400'
          }`}
          role="status"
          aria-live="polite"
        >
          {state === 'preparing' && 'Preparing audio…'}
          {state === 'failed' && (errorMessage ?? 'Audio failed')}
          {state === 'unsupported' && (errorMessage ?? 'Language unsupported')}
          {state === 'pack_missing' &&
            (approxSizeBytes
              ? `Speech model ${formatApproxSize(approxSizeBytes)}`
              : 'Speech model needed')}
        </span>
      )}

      <button
        type="button"
        disabled={state === 'unsupported' || isPreparing}
        onClick={() => {
          if (state === 'pack_missing') onInstallSpeechPack?.();
          else if (state === 'failed') onRetry?.();
          else if (isPlaying) onStop?.();
          else if (canPlay) onPlay?.();
        }}
        title={accessibleName(state)}
        aria-label={accessibleName(state)}
        className={`grid size-5 place-items-center rounded border transition-colors disabled:cursor-default disabled:opacity-60 ${
          state === 'failed' || state === 'pack_missing'
            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        {isPreparing ? (
          <svg
            className="size-2.5 motion-safe:animate-spin motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M21 12a9 9 0 1 1-2.64-6.36"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        ) : isPlaying ? (
          <svg className="size-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : state === 'failed' || state === 'pack_missing' ? (
          <svg className="size-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 12a7.5 7.5 0 0 1 12.37-5.7L19.5 4.5v6h-6l2.2-2.2A5.5 5.5 0 1 0 17.5 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="size-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5L8 5.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
