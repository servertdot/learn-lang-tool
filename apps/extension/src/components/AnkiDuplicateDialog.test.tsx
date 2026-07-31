import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AnkiDuplicateDialog } from './AnkiDuplicateDialog';

describe('AnkiDuplicateDialog', () => {
  it('compares the queued card with the existing Anki note and asks for a decision', () => {
    const html = renderToStaticMarkup(
      <AnkiDuplicateDialog
        conflicts={[
          {
            queueItemId: 'duplicate-1',
            pendingNote: {
              deckName: 'English',
              modelName: 'Basic',
              fields: { Front: 'hello', Back: 'привет новый' },
              tags: [],
              options: { allowDuplicate: false },
            },
            existingNotes: [
              {
                noteId: 42,
                modelName: 'Basic',
                fields: { Front: 'hello', Back: 'привет' },
                tags: [],
              },
            ],
          },
        ]}
        decisions={{}}
        busy={false}
        onDecision={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Waiting to sync');
    expect(html).toContain('Already in Anki');
    expect(html).toContain('привет новый');
    expect(html).toContain('привет');
    expect(html).toContain('Do not add');
    expect(html).toContain('Add anyway');
    expect(html).toContain('disabled=""');
  });
});
