export interface AnkiFieldMapping {
  expression: string;
  reading: string;
  sentence: string;
  glossary: string;
}

export interface AnkiSettings {
  serverAddress: string;
  apiKey: string;
  deckName: string;
  modelName: string;
  tags: string[];
  fields: AnkiFieldMapping;
}

export interface AnkiCardContent {
  expression: string;
  reading: string;
  sentence: string;
  glossary: string;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options: {
    allowDuplicate: boolean;
  };
}

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  serverAddress: 'http://127.0.0.1:8765',
  apiKey: '',
  deckName: 'English',
  modelName: 'Basic (and reversed card)',
  tags: ['yomitan'],
  fields: {
    expression: 'Word',
    reading: 'Reading',
    sentence: 'Sentence',
    glossary: 'Meaning',
  },
};

export function createAnkiNote(
  settings: AnkiSettings,
  content: AnkiCardContent,
): AnkiNote {
  return {
    deckName: settings.deckName,
    modelName: settings.modelName,
    fields: {
      [settings.fields.expression]: content.expression,
      [settings.fields.reading]: content.reading,
      [settings.fields.sentence]: content.sentence,
      [settings.fields.glossary]: content.glossary,
    },
    tags: settings.tags,
    options: {
      allowDuplicate: false,
    },
  };
}
