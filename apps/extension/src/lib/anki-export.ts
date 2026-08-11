import { isAnkiQueueTag, type AnkiQueueItem } from './anki-queue';

export type AnkiExportFormat = 'anki' | 'tsv' | 'csv';

export interface AnkiQueueExport {
  content: string;
  filename: string;
  mimeType: string;
}

function escapeCell(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !value.includes('"') && !/[\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportAnkiQueue(
  items: AnkiQueueItem[],
  format: AnkiExportFormat,
  date = new Date(),
  fieldNamesByModel: Record<string, string[]> = {},
): AnkiQueueExport {
  const delimiter = format === 'csv' ? ',' : '\t';
  const separatorName = format === 'csv' ? 'Comma' : 'Tab';
  const layouts = items.map(item => {
    const configuredNames = fieldNamesByModel[item.note.modelName];
    const fieldNames = configuredNames?.length ? configuredNames : Object.keys(item.note.fields);
    return {
      fieldNames,
      values: fieldNames.map(fieldName => item.note.fields[fieldName] ?? ''),
    };
  });
  const firstFieldNames = layouts[0]?.fieldNames ?? [];
  const fieldCount = Math.max(0, ...layouts.map(layout => layout.fieldNames.length));
  const hasOneFieldLayout = layouts.every(
    layout => layout.fieldNames.join('\u0000') === firstFieldNames.join('\u0000'),
  );
  const regularColumns = hasOneFieldLayout
    ? firstFieldNames
    : Array.from({ length: fieldCount }, (_, index) => `Field ${index + 1}`);
  const columns = ['Deck', 'Notetype', 'Tags', ...regularColumns];
  const serialize = (cells: string[]) =>
    cells.map(cell => escapeCell(cell, delimiter)).join(delimiter);

  const rows = items.map((item, itemIndex) => {
    const tags = item.note.tags.filter(tag => !isAnkiQueueTag(tag)).join(' ');
    const values = layouts[itemIndex]?.values ?? [];
    return serialize([
      item.note.deckName,
      item.note.modelName,
      tags,
      ...Array.from({ length: fieldCount }, (_, index) => values[index] ?? ''),
    ]);
  });
  const content = [
    `#separator:${separatorName}`,
    '#html:false',
    '#deck column:1',
    '#notetype column:2',
    '#tags column:3',
    `#columns:${serialize(columns)}`,
    ...rows,
  ].join('\n');
  const day = date.toISOString().slice(0, 10);
  const extension = format === 'anki' ? 'txt' : format;

  return {
    content: `\uFEFF${content}\n`,
    filename: `learn-lang-tool-anki-${format === 'anki' ? 'import-' : ''}${day}.${extension}`,
    mimeType:
      format === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'text/tab-separated-values;charset=utf-8',
  };
}
