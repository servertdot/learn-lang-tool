import React from 'react';
import type { AnkiDuplicateConflict } from '@src/lib/anki-queue-sync';
import type { AnkiDuplicateDecision } from '@src/lib/extension-messages';

type DuplicateAction = AnkiDuplicateDecision['action'];

interface AnkiDuplicateDialogProps {
  conflicts: AnkiDuplicateConflict[];
  decisions: Record<string, DuplicateAction | undefined>;
  busy: boolean;
  onDecision(queueItemId: string, action: DuplicateAction): void;
  onCancel(): void;
  onConfirm(): void;
}

function NoteFields({ fields }: { fields: Record<string, string> }) {
  return (
    <dl className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
      {Object.entries(fields).map(([name, value]) => (
        <div key={name} className="grid grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] gap-3 px-3 py-2">
          <dt className="truncate text-xs font-medium text-gray-500">{name}</dt>
          <dd className="break-words text-xs text-gray-900">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AnkiDuplicateDialog({
  conflicts,
  decisions,
  busy,
  onDecision,
  onCancel,
  onConfirm,
}: AnkiDuplicateDialogProps) {
  const allDecided = conflicts.every(conflict => decisions[conflict.queueItemId] !== undefined);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-duplicate-title"
        aria-describedby="anki-duplicate-description"
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="border-b border-gray-200 px-6 py-5">
          <h2 id="anki-duplicate-title" className="text-lg font-semibold text-gray-900">
            Duplicates need your decision
          </h2>
          <p id="anki-duplicate-description" className="mt-1 text-sm leading-relaxed text-gray-600">
            Other cards were synced. Compare each queued card with the note already in Anki,
            then choose whether to add another copy.
          </p>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {conflicts.map((conflict, conflictIndex) => (
            <article
              key={conflict.queueItemId}
              className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Duplicate {conflictIndex + 1} of {conflicts.length}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Waiting to sync
                  </p>
                  <NoteFields fields={conflict.pendingNote.fields} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Already in Anki
                  </p>
                  {conflict.existingNotes.length > 0 ? (
                    <div className="space-y-2">
                      {conflict.existingNotes.map(existing => (
                        <NoteFields key={existing.noteId} fields={existing.fields} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs leading-relaxed text-gray-600">
                      Anki reported a duplicate, but its existing note details could not be loaded.
                    </p>
                  )}
                </div>
              </div>

              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-gray-700">What should happen?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {([
                    ['skip', 'Do not add', 'Remove this queued copy.'],
                    ['add', 'Add anyway', 'Create another note in Anki.'],
                  ] as const).map(([action, label, description]) => (
                    <label
                      key={action}
                      className={`cursor-pointer rounded-lg border bg-white px-3 py-2.5 transition-colors ${
                        decisions[conflict.queueItemId] === action
                          ? 'border-blue-500 ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`duplicate-${conflict.queueItemId}`}
                          value={action}
                          checked={decisions[conflict.queueItemId] === action}
                          onChange={() => onDecision(conflict.queueItemId, action)}
                          disabled={busy}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-xs font-semibold text-gray-900">{label}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </article>
          ))}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Decide later
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !allDecided}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Applying…' : 'Apply decisions'}
          </button>
        </footer>
      </section>
    </div>
  );
}
