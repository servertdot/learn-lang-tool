export const ANKI_FIELD_VALUES = ['textFrom', 'textTo', 'sentence'] as const;

export type AnkiFieldValue = (typeof ANKI_FIELD_VALUES)[number];
export type AnkiFieldMappings = Record<string, AnkiFieldValue | null>;

export interface AnkiSettings {
  name: string;
  serverAddress: string;
  apiKey: string;
  deckName: string;
  modelName: string;
  tags: string[];
  fieldMappings: AnkiFieldMappings;
}

export interface AnkiCardContent {
  textFrom: string;
  textTo: string;
  sentence: string;
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
  name: 'Default',
  serverAddress: 'http://127.0.0.1:8765',
  apiKey: '',
  deckName: 'English',
  modelName: 'Basic (and reversed card)',
  tags: ['yomitan'],
  fieldMappings: {
    Word: 'textFrom',
    Reading: null,
    Sentence: 'sentence',
    Meaning: 'textTo',
  },
};

export function isAnkiFieldValue(value: unknown): value is AnkiFieldValue {
  return typeof value === 'string' && ANKI_FIELD_VALUES.includes(value as AnkiFieldValue);
}

export function inferAnkiFieldValue(fieldName: string): AnkiFieldValue | null {
  const name = fieldName.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  if (
    ['front', 'textfrom', 'source', 'original', 'word', 'expression', 'term'].some(marker =>
      name.includes(marker),
    )
  ) {
    return 'textFrom';
  }
  if (
    ['back', 'textto', 'target', 'translation', 'meaning', 'glossary', 'definition'].some(
      marker => name.includes(marker),
    )
  ) {
    return 'textTo';
  }
  if (['sentence', 'context', 'example'].some(marker => name.includes(marker))) {
    return 'sentence';
  }
  return null;
}

export function reconcileAnkiFieldMappings(
  fieldNames: string[],
  current: AnkiFieldMappings = {},
): AnkiFieldMappings {
  return Object.fromEntries(
    fieldNames.map(fieldName => [
      fieldName,
      isAnkiFieldValue(current[fieldName])
        ? current[fieldName]
        : inferAnkiFieldValue(fieldName),
    ]),
  );
}

export function createAnkiNote(
  settings: AnkiSettings,
  content: AnkiCardContent,
): AnkiNote {
  const fields = Object.fromEntries(
    Object.entries(settings.fieldMappings).flatMap(([fieldName, value]) =>
      value ? [[fieldName, content[value]]] : [],
    ),
  );

  return {
    deckName: settings.deckName,
    modelName: settings.modelName,
    fields,
    tags: settings.tags,
    options: {
      allowDuplicate: false,
    },
  };
}
