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
  it('creates a text file that can be selected in Anki File > Import', () => {
    const result = exportAnkiQueue([item], 'anki', new Date('2026-07-22T12:00:00Z'));

    expect(result.filename).toBe('learn-lang-tool-anki-import-2026-07-22.txt');
    expect(result.mimeType).toBe('text/tab-separated-values;charset=utf-8');
    expect(result.content).toContain('#separator:Tab');
    expect(result.content).toContain('#notetype column:2');
    expect(result.content).toContain('#tags column:3');
  });

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

  it('uses positional fields when the queue contains different note type layouts', () => {
    const second: AnkiQueueItem = {
      ...item,
      id: 'two',
      note: {
        ...item.note,
        modelName: 'Basic',
        fields: { Front: 'cat', Back: 'кот' },
      },
    };

    const result = exportAnkiQueue([item, second], 'anki');

    expect(result.content).toContain('#columns:Deck\tNotetype\tTags\tField 1\tField 2');
    expect(result.content).toContain('Basic\tyomitan\tcat\tкот');
  });

  it('restores empty configured fields in legacy queued notes', () => {
    const result = exportAnkiQueue(
      [item],
      'anki',
      new Date('2026-07-22T12:00:00Z'),
      { 'Basic (and reversed card)': ['Word', 'Audio', 'Meaning'] },
    );

    expect(result.content).toContain('#columns:Deck\tNotetype\tTags\tWord\tAudio\tMeaning');
    expect(result.content).toContain('hello, world\t\t"привет\nмир"');
  });
});
