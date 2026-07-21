import React from 'react';
import type { TranslateResponse } from '@package/shared';

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
}

export type PopoverState = LoadingState | SuccessState | ErrorState;

interface Props {
  state: PopoverState;
  position: { x: number; y: number };
  onAddToAnki?: () => void;
}

export function TranslationPopover({ state, position, onAddToAnki }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
      }}
      className="max-w-sm rounded-xl shadow-xl border border-gray-200 bg-white text-sm text-gray-900 overflow-hidden"
    >
      {state.kind === 'loading' && (
        <div className="px-4 py-3 flex items-center gap-2 text-gray-500">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          <span>Translating…</span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="px-4 py-3 flex items-center gap-2 text-red-600">
          <span className="text-lg">⚠</span>
          <span>Translation failed</span>
        </div>
      )}

      {state.kind === 'success' && (
        <div>
          <div className="px-4 pt-3 pb-2">
            <p className="font-medium text-gray-900 leading-snug">
              {state.data.translated_text}
            </p>
          </div>
          <div className="px-4 pb-3 border-t border-gray-100 pt-2">
            <p className="text-xs text-gray-400">{state.data.source_text}</p>
          </div>
          {state.data.can_add_to_anki && (
            <div className="px-4 pb-3">
              <button
                onClick={onAddToAnki}
                className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                Add to Anki
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
