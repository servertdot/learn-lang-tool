import { describe, expect, it } from 'vitest';
import {
  createAnkiNote,
  DEFAULT_ANKI_SETTINGS,
  getAnkiAudioFieldNames,
  reconcileAnkiFieldMappings,
} from './anki';

describe('createAnkiNote', () => {
  it('maps translation content to the default Anki fields', () => {
    expect(
      createAnkiNote(DEFAULT_ANKI_SETTINGS, {
        textFrom: 'hello',
        textTo: 'привет',
        sentence: 'She said hello to everyone.',
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
      fieldMappings: {
        Expression: 'textFrom' as const,
        Pronunciation: null,
        Context: 'sentence' as const,
        Translation: 'textTo' as const,
      },
    };
    const note = createAnkiNote(settings, {
      textFrom: 'word',
      textTo: 'слово',
      sentence: 'A word in context.',
    });

    expect(note.fields).toEqual({
      Expression: 'word',
      Pronunciation: '',
      Context: 'A word in context.',
      Translation: 'слово',
    });
  });

  it('keeps audio-mapped fields empty so exports preserve the Anki field order', () => {
    const settings = {
      ...DEFAULT_ANKI_SETTINGS,
      fieldMappings: {
        Word: 'textFrom' as const,
        Reading: 'audio' as const,
        Meaning: 'textTo' as const,
      },
    };
    const note = createAnkiNote(settings, {
      textFrom: 'hello',
      textTo: 'привет',
      sentence: 'Hello there.',
    });

    expect(note.fields).toEqual({
      Word: 'hello',
      Reading: '',
      Meaning: 'привет',
    });
    expect(getAnkiAudioFieldNames(settings)).toEqual(['Reading']);
  });

  it('preserves matching choices and infers common model field names', () => {
    expect(
      reconcileAnkiFieldMappings(['Word', 'Translation', 'Example', 'Audio', 'Reading'], {
        Word: 'sentence',
        OldField: 'textFrom',
      }),
    ).toEqual({
      Word: 'sentence',
      Translation: 'textTo',
      Example: 'sentence',
      Audio: 'audio',
      Reading: 'audio',
    });
  });

  it('defaults Reading to the audio semantic mapping', () => {
    expect(DEFAULT_ANKI_SETTINGS.fieldMappings.Reading).toBe('audio');
  });
});
