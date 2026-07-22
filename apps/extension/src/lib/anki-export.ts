import { isAnkiQueueTag, type AnkiQueueItem } from './anki-queue';

export type AnkiExportFormat = 'tsv' | 'csv';

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
): AnkiQueueExport {
  const delimiter = format === 'tsv' ? '\t' : ',';
  const separatorName = format === 'tsv' ? 'Tab' : 'Comma';
  const fieldNames = Array.from(new Set(items.flatMap(item => Object.keys(item.note.fields))));
  const columns = ['Deck', 'Notetype', 'Tags', ...fieldNames];
  const serialize = (cells: string[]) =>
    cells.map(cell => escapeCell(cell, delimiter)).join(delimiter);

  const rows = items.map(item => {
    const tags = item.note.tags.filter(tag => !isAnkiQueueTag(tag)).join(' ');
    return serialize([
      item.note.deckName,
      item.note.modelName,
      tags,
      ...fieldNames.map(fieldName => item.note.fields[fieldName] ?? ''),
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

  return {
    content: `\uFEFF${content}\n`,
    filename: `learn-lang-tool-anki-${day}.${format}`,
    mimeType: format === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8',
  };
}
