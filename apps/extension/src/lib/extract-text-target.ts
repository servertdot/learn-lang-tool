import { normalizeText } from './normalize-text';

export type TranslationMode = 'phrase' | 'word';

export interface TextTarget {
  text: string;
  context: string | null;
  mode: TranslationMode;
}

/** Defensive cap: a "word" longer than this is almost certainly a bad extraction. */
export const MAX_WORD_CHARS = 64;

function firstToken(text: string): string {
  return text.split(/\s+/).filter(Boolean)[0] ?? '';
}

/**
 * Extracts the text to translate from the current selection and the word
 * under the cursor (for word mode).
 *
 * Phrase mode: user selected multiple words → send selection as-is.
 * Word mode: single word selected or nothing → use that word only;
 *   surrounding sentence is context for Anki, never the translation text.
 */
export function extractTextTarget(
  selectionText: string,
  wordUnderCursor: string | null,
  sentenceContext: string | null,
): TextTarget | null {
  const normalized = normalizeText(selectionText);

  // Phrase mode: selection contains whitespace (more than one token)
  if (normalized.length > 0 && /\s/.test(normalized)) {
    return { text: normalized, context: null, mode: 'phrase' };
  }

  // Word mode: explicit single-token selection wins over cursor expansion
  let word =
    normalized.length > 0
      ? firstToken(normalized)
      : wordUnderCursor
        ? firstToken(normalizeText(wordUnderCursor))
        : '';

  word = word.trim();
  if (!word) return null;

  // Bad extraction safeguard (e.g. entire text node without spaces)
  if (word.length > MAX_WORD_CHARS) {
    return null;
  }

  return {
    text: word,
    context: sentenceContext ? normalizeText(sentenceContext) : null,
    mode: 'word',
  };
}
