import React, { useLayoutEffect, useRef } from 'react';
import type { TranslateResponse } from '@package/shared';
import type { TranslationFacadeErrorCode } from '@src/lib/translation-facade';

interface LoadingState {
  kind: 'loading';
}

interface SuccessState {
  kind: 'success';
  data: TranslateResponse;
}

interface ErrorState {
  kind: 'error';
  message: string;
  code?: TranslationFacadeErrorCode;
}

export type PopoverState = LoadingState | SuccessState | ErrorState;
export type AnkiAddState = 'idle' | 'adding' | 'added' | 'error';
export type AnkiViewState = 'idle' | 'opening' | 'error';

interface Props {
  state: PopoverState;
  position: { x: number; y: number };
  onAddToAnki?: () => void;
  onViewInAnki?: () => void;
  onInstallModelPack?: () => void;
  ankiState?: AnkiAddState;
  ankiViewState?: AnkiViewState;
  ankiError?: string | null;
}

export function TranslationPopover({
  state,
  position,
  onAddToAnki,
  onViewInAnki,
  onInstallModelPack,
  ankiState = 'idle',
  ankiViewState = 'idle',
  ankiError,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const viewportMargin = 12;
    const selectionGap = 8;
    const bounds = popover.getBoundingClientRect();
    const left = Math.min(
      Math.max(position.x, viewportMargin),
      Math.max(viewportMargin, window.innerWidth - bounds.width - viewportMargin),
    );
    const fitsBelow = position.y + bounds.height <= window.innerHeight - viewportMargin;
    const top = fitsBelow
      ? position.y
      : Math.max(viewportMargin, position.y - bounds.height - selectionGap * 2);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, [position.x, position.y, state]);

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
      }}
      className="llt-popover w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-slate-200/90 bg-white text-sm text-slate-950 shadow-[0_14px_36px_-20px_rgba(15,23,42,0.38)]"
    >
      {state.kind === 'loading' && (
        <div className="flex items-center gap-3 px-4 py-4" role="status" aria-live="polite">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 12a9 9 0 1 1-2.64-6.36"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold tracking-[-0.01em] text-slate-800">Translating</p>
            <p className="mt-0.5 text-xs text-slate-500">Finding the clearest meaning…</p>
          </div>
          <span className="flex gap-1" aria-hidden="true">
            <span className="llt-loading-dot size-1.5 rounded-full bg-indigo-400" />
            <span className="llt-loading-dot size-1.5 rounded-full bg-indigo-400" />
            <span className="llt-loading-dot size-1.5 rounded-full bg-indigo-400" />
          </span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex items-start gap-3 px-4 py-4" role="alert">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 8v4m0 4h.01M10.3 3.84 2.82 17a2 2 0 0 0 1.74 3h14.88a2 2 0 0 0 1.74-3L13.7 3.84a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="font-semibold tracking-[-0.01em] text-slate-800">Couldn’t translate</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{state.message}</p>
            {state.code === 'model_pack_missing' && onInstallModelPack && (
              <button
                type="button"
                onClick={onInstallModelPack}
                className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
              >
                Download model pack
              </button>
            )}
          </div>
        </div>
      )}

      {state.kind === 'success' && (
        <div className="px-4 py-4">
          <div className="flex min-h-5 items-center justify-between gap-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
              Translation
            </p>
            {state.data.can_add_to_anki && (
              <div className="flex items-center gap-1">
                {ankiState === 'added' && onViewInAnki && (
                  <button
                    type="button"
                    onClick={onViewInAnki}
                    disabled={ankiViewState === 'opening'}
                    title="View added note in Anki"
                    aria-label={
                      ankiViewState === 'opening'
                        ? 'Opening added note in Anki'
                        : 'View added note in Anki'
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
                  onClick={onAddToAnki}
                  disabled={ankiState === 'adding' || ankiState === 'added'}
                  title={ankiState === 'added' ? 'Added to Anki' : 'Add to Anki'}
                  aria-label={
                    ankiState === 'adding'
                      ? 'Adding to Anki'
                      : ankiState === 'added'
                        ? 'Added to Anki'
                        : ankiState === 'error'
                          ? 'Try adding to Anki again'
                          : 'Add to Anki'
                  }
                  className="grid size-5 place-items-center rounded bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-default disabled:opacity-70"
                >
                  <svg
                    className={`size-2.5 ${ankiState === 'adding' ? 'animate-pulse' : ''}`}
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
            )}
          </div>

          {(ankiState === 'error' || ankiViewState === 'error') && ankiError && (
            <p className="mb-3 text-xs leading-relaxed text-rose-600" role="alert">
              {ankiError}
            </p>
          )}

          <p
            className="mt-1 text-[15px] font-medium leading-relaxed text-slate-900"
            aria-live="polite"
          >
            {state.data.translated_text}
          </p>

          <div className="my-3 border-t border-slate-200" />

          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
            Original
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            {state.data.source_text}
          </p>
        </div>
      )}
    </div>
  );
}
