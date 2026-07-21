import { normalizeText } from './normalize-text';

export type TranslationMode = 'phrase' | 'word';

export interface TextTarget {
  text: string;
  context: string | null;
  mode: TranslationMode;
}

/**
 * Extracts the text to translate from the current selection and the word
 * under the cursor (for word mode).
 *
 * Phrase mode: user selected multiple words → send selection as-is.
 * Word mode: single word selected or nothing → use wordUnderCursor; capture
 *   the surrounding sentence from sentenceContext as context.
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

  // Word mode: either a single-word selection or no selection at all
  const word = normalized.length > 0 ? normalized : (wordUnderCursor ? normalizeText(wordUnderCursor) : null);
  if (!word) return null;

  return {
    text: word,
    context: sentenceContext ? normalizeText(sentenceContext) : null,
    mode: 'word',
  };
}
