import { describe, expect, it } from 'vitest';
import { exportAnkiQueue } from './anki-export';
import type { AnkiQueueItem } from './anki-queue';

const item: AnkiQueueItem = {
  id: 'one',
  createdAt: 1,
  note: {
    deckName: 'English',
    modelName: 'Basic (and reversed card)',
    fields: {
      Word: 'hello, world',
      Meaning: 'привет\nмир',
    },
    tags: ['yomitan', 'llt_queue_one'],
    options: { allowDuplicate: false },
  },
};

describe('exportAnkiQueue', () => {
  it('creates an Anki-ready TSV with deck, notetype, tags, and mapped fields', () => {
    const result = exportAnkiQueue([item], 'tsv', new Date('2026-07-22T12:00:00Z'));

    expect(result.filename).toBe('learn-lang-tool-anki-2026-07-22.tsv');
    expect(result.content).toContain('#separator:Tab');
    expect(result.content).toContain('#deck column:1');
    expect(result.content).toContain('#columns:Deck\tNotetype\tTags\tWord\tMeaning');
    expect(result.content).toContain('English\tBasic (and reversed card)\tyomitan');
    expect(result.content).not.toContain('llt_queue_one');
  });

  it('quotes separators, quotes, and newlines in CSV output', () => {
    const result = exportAnkiQueue([item], 'csv', new Date('2026-07-22T12:00:00Z'));

    expect(result.content).toContain('#separator:Comma');
    expect(result.content).toContain('"hello, world"');
    expect(result.content).toContain('"привет\nмир"');
  });
});
