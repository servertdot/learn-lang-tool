import { describe, expect, it } from 'vitest';
import { createAnkiNote, DEFAULT_ANKI_SETTINGS } from './anki';

describe('createAnkiNote', () => {
  it('maps translation content to the default Anki fields', () => {
    expect(
      createAnkiNote(DEFAULT_ANKI_SETTINGS, {
        expression: 'hello',
        reading: '',
        sentence: 'She said hello to everyone.',
        glossary: 'привет',
      }),
    ).toEqual({
      deckName: 'English',
      modelName: 'Basic (and reversed card)',
      fields: {
        Word: 'hello',
        Reading: '',
        Sentence: 'She said hello to everyone.',
        Meaning: 'привет',
      },
      tags: ['yomitan'],
      options: { allowDuplicate: false },
    });
  });

  it('uses configurable Anki field names', () => {
    const settings = {
      ...DEFAULT_ANKI_SETTINGS,
      fields: {
        expression: 'Expression',
        reading: 'Pronunciation',
        sentence: 'Context',
        glossary: 'Translation',
      },
    };
    const note = createAnkiNote(settings, {
      expression: 'word',
      reading: 'wurd',
      sentence: 'A word in context.',
      glossary: 'слово',
    });

    expect(note.fields).toEqual({
      Expression: 'word',
      Pronunciation: 'wurd',
      Context: 'A word in context.',
      Translation: 'слово',
    });
  });
});
