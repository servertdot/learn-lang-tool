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
    <dl className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.03]">
      {Object.entries(fields).map(([name, value]) => (
        <div key={name} className="grid grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] gap-3 px-3 py-2">
          <dt className="truncate text-xs font-medium text-zinc-500">{name}</dt>
          <dd className="break-words text-xs text-zinc-100">{value || '—'}</dd>
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
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
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#2a2a2c] shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-white/[0.08] px-6 py-5">
          <h2 id="anki-duplicate-title" className="text-lg font-semibold text-zinc-50">
            Duplicates need your decision
          </h2>
          <p id="anki-duplicate-description" className="mt-1 text-sm leading-relaxed text-zinc-400">
            Other cards were synced. Compare each queued card with the note already in Anki,
            then choose whether to add another copy.
          </p>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {conflicts.map((conflict, conflictIndex) => (
            <article
              key={conflict.queueItemId}
              className="rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-4"
            >
              <h3 className="text-sm font-semibold text-zinc-100">
                Duplicate {conflictIndex + 1} of {conflicts.length}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/90">
                    Waiting to sync
                  </p>
                  <NoteFields fields={conflict.pendingNote.fields} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                    Already in Anki
                  </p>
                  {conflict.existingNotes.length > 0 ? (
                    <div className="space-y-2">
                      {conflict.existingNotes.map(existing => (
                        <NoteFields key={existing.noteId} fields={existing.fields} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-xs leading-relaxed text-zinc-400">
                      Anki reported a duplicate, but its existing note details could not be loaded.
                    </p>
                  )}
                </div>
              </div>

              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-zinc-300">What should happen?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {([
                    ['skip', 'Do not add', 'Remove this queued copy.'],
                    ['add', 'Add anyway', 'Create another note in Anki.'],
                  ] as const).map(([action, label, description]) => (
                    <label
                      key={action}
                      className={`cursor-pointer rounded-[10px] border px-3 py-2.5 transition-colors ${
                        decisions[conflict.queueItemId] === action
                          ? 'border-[#7eb0ff]/60 bg-[#7eb0ff]/10 ring-2 ring-[#7eb0ff]/20'
                          : 'border-white/[0.1] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06]'
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
                          <span className="block text-xs font-semibold text-zinc-100">{label}</span>
                          <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </article>
          ))}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.08] bg-black/20 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[10px] border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50"
          >
            Decide later
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !allDecided}
            className="rounded-[10px] bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Applying…' : 'Apply decisions'}
          </button>
        </footer>
      </section>
    </div>
  );
}
