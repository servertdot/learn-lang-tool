/**
 * Resolves the text node + character offset for a range start.
 * Handles Element containers where startOffset is a child index, not a char offset.
 */
export function resolveTextCaret(range: Range): { node: Text; offset: number } | null {
  let node: Node | null = range.startContainer;
  let offset = range.startOffset;

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (el.childNodes.length === 0) return null;

    if (offset >= el.childNodes.length) {
      node = el.childNodes[el.childNodes.length - 1] ?? null;
      while (node && node.nodeType !== Node.TEXT_NODE) {
        node = node.lastChild;
      }
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      offset = node.textContent?.length ?? 0;
    } else {
      node = el.childNodes[offset] ?? null;
      while (node && node.nodeType !== Node.TEXT_NODE) {
        node = node.firstChild;
      }
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      offset = 0;
    }
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const textNode = node as Text;
  const length = textNode.textContent?.length ?? 0;
  offset = Math.max(0, Math.min(offset, length));
  return { node: textNode, offset };
}

function wordFromSegmenter(text: string, offset: number): string | null {
  const SegmenterCtor = (Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
    ) => { segment: (input: string) => Iterable<{ segment: string; index: number; isWordLike?: boolean }> };
  }).Segmenter;

  if (!SegmenterCtor) return null;

  const segmenter = new SegmenterCtor(undefined, { granularity: 'word' });
  for (const part of segmenter.segment(text)) {
    const start = part.index;
    const end = start + part.segment.length;
    if (offset >= start && offset <= end) {
      if (part.isWordLike === false) {
        continue;
      }
      const word = part.segment.trim();
      return word || null;
    }
  }
  return null;
}

function wordFromWhitespace(text: string, offset: number): string | null {
  if (!text) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  while (end < text.length && !/\s/.test(text[end]!)) end++;
  const word = text.slice(start, end).trim();
  return word || null;
}

/** Max chars for a sentence window used as Anki context (not for translation). */
const MAX_CONTEXT_CHARS = 400;

export function extractSentenceAround(text: string, wordOffset: number): string | null {
  if (!text) return null;

  const sentenceRe = /[^.!?]*[.!?]+|[^.!?]+$/g;
  let match: RegExpExecArray | null;
  let accumulated = 0;
  while ((match = sentenceRe.exec(text)) !== null) {
    const segment = match[0];
    const start = accumulated;
    accumulated += segment.length;
    if (accumulated >= wordOffset) {
      const trimmed = segment.replace(/\s+/g, ' ').trim();
      if (!trimmed) return null;
      if (trimmed.length > MAX_CONTEXT_CHARS) {
        const local = Math.max(0, wordOffset - start);
        const from = Math.max(0, local - Math.floor(MAX_CONTEXT_CHARS / 2));
        return trimmed.slice(from, from + MAX_CONTEXT_CHARS).trim() || null;
      }
      return trimmed;
    }
  }

  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CONTEXT_CHARS) {
    const from = Math.max(0, wordOffset - Math.floor(MAX_CONTEXT_CHARS / 2));
    return trimmed.slice(from, from + MAX_CONTEXT_CHARS).trim() || null;
  }
  return trimmed;
}

export function getWordAtRange(range: Range): { word: string | null; sentence: string | null } {
  const caret = resolveTextCaret(range);
  if (!caret) return { word: null, sentence: null };

  const text = caret.node.textContent ?? '';
  const word =
    wordFromSegmenter(text, caret.offset) ?? wordFromWhitespace(text, caret.offset);

  // Prefer sentence within the same text node (avoids grabbing whole article via parent).
  const sentence = extractSentenceAround(text, caret.offset);

  return { word, sentence };
}
