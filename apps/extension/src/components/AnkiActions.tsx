import React from 'react';

export type AnkiAddState = 'idle' | 'adding' | 'added' | 'error';
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
          className="grid size-5 place-items-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-wait disabled:opacity-50"
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
        disabled={addState === 'adding' || addState === 'added'}
        title={addState === 'added' ? 'Added to Anki' : 'Add to Anki'}
        aria-label={
          addState === 'adding'
            ? 'Adding to Anki'
            : addState === 'added'
              ? 'Added to Anki'
              : addState === 'error'
                ? 'Try adding to Anki again'
                : 'Add to Anki'
        }
        className="grid size-5 place-items-center rounded bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-default disabled:opacity-70"
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
