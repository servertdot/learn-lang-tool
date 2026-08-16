import React from 'react';

export type AnkiAddState = 'idle' | 'adding' | 'queued' | 'added' | 'error';
export type AnkiViewState = 'idle' | 'opening' | 'error';

interface AnkiActionsProps {
  addState: AnkiAddState;
  viewState: AnkiViewState;
  onAdd?: () => void;
  onView?: () => void;
}

export function AnkiActions({ addState, viewState, onAdd, onView }: AnkiActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {addState === 'added' && onView && (
        <button
          type="button"
          onClick={onView}
          disabled={viewState === 'opening'}
          title="View added note in Anki"
          aria-label={
            viewState === 'opening' ? 'Opening added note in Anki' : 'View added note in Anki'
          }
          className="grid size-5 place-items-center rounded border border-white/[0.1] bg-white/[0.04] text-zinc-400 transition-colors hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-wait disabled:opacity-50"
        >
          <svg className="size-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 5.75A2.75 2.75 0 0 1 7.25 3H11v16H7.25a2.75 2.75 0 0 0-2.75 2V5.75ZM19.5 5.75A2.75 2.75 0 0 0 16.75 3H13v16h3.75a2.75 2.75 0 0 1 2.75 2V5.75Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={addState === 'adding' || addState === 'queued' || addState === 'added'}
        title={
          addState === 'added'
            ? 'Added to Anki'
            : addState === 'queued'
              ? 'Saved for Anki sync'
              : 'Add to Anki'
        }
        aria-label={
          addState === 'adding'
            ? 'Adding to Anki'
            : addState === 'added'
              ? 'Added to Anki'
              : addState === 'queued'
                ? 'Saved for later Anki sync'
              : addState === 'error'
                ? 'Try adding to Anki again'
                : 'Add to Anki'
        }
        className={`grid size-5 place-items-center rounded transition-colors disabled:cursor-default disabled:opacity-70 ${
          addState === 'queued'
            ? 'border border-amber-400/25 bg-amber-400/15 text-amber-300'
            : 'border border-emerald-400/25 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
        }`}
      >
        <svg
          className={`size-2.5 ${addState === 'adding' ? 'animate-pulse' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
