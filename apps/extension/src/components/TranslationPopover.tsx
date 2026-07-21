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

interface Props {
  state: PopoverState;
  position: { x: number; y: number };
  onAddToAnki?: () => void;
  onInstallModelPack?: () => void;
}

export function TranslationPopover({
  state,
  position,
  onAddToAnki,
  onInstallModelPack,
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
      className="llt-popover w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-sm text-slate-950 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.45),0_8px_20px_-12px_rgba(15,23,42,0.2)]"
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-indigo-600">
              <span className="grid size-6 place-items-center rounded-lg bg-indigo-50">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Zm13.5-1 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              Translation
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span>{state.data.from_code}</span>
              <svg className="size-3 text-slate-400" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 8h10m-3-3 3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{state.data.to_code}</span>
            </div>
          </div>

          <p
            className="text-[17px] font-semibold leading-[1.45] tracking-[-0.015em] text-slate-900"
            aria-live="polite"
          >
            {state.data.translated_text}
          </p>

          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Original</p>
            <p className="text-xs leading-relaxed text-slate-600">{state.data.source_text}</p>
          </div>

          {state.data.can_add_to_anki && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={onAddToAnki}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-600 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <svg className="size-3.5 transition-transform duration-150 group-hover:rotate-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                </svg>
                Add to Anki
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
