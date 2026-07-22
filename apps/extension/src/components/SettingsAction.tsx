import React from 'react';

interface SettingsActionProps {
  onOpen: () => void;
}

export function SettingsAction({ onOpen }: SettingsActionProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open settings"
      aria-label="Open settings"
      className="grid size-5 place-items-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
    >
      <svg className="size-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9.6 3.3h4.8l.55 2.15c.5.2.97.47 1.4.8l2.12-.6 2.4 4.15-1.58 1.55a7.7 7.7 0 0 1 0 1.3l1.58 1.55-2.4 4.15-2.12-.6c-.43.33-.9.6-1.4.8L14.4 20.7H9.6l-.55-2.15a7.8 7.8 0 0 1-1.4-.8l-2.12.6-2.4-4.15 1.58-1.55a7.7 7.7 0 0 1 0-1.3L3.13 9.8l2.4-4.15 2.12.6c.43-.33.9-.6 1.4-.8L9.6 3.3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </button>
  );
}
