import { describe, it, expect } from 'vitest';
import { extractTextTarget } from './extract-text-target';

describe('extractTextTarget', () => {
  describe('phrase mode', () => {
    it('returns phrase mode when selection has multiple words', () => {
      const result = extractTextTarget('hello world', null, null);
      expect(result).toEqual({ text: 'hello world', context: null, mode: 'phrase' });
    });

    it('trims selection in phrase mode', () => {
      const result = extractTextTarget('  hello world  ', null, null);
      expect(result?.text).toBe('hello world');
    });

    it('ignores wordUnderCursor in phrase mode', () => {
      const result = extractTextTarget('hello world', 'ignored', 'some sentence');
      expect(result?.mode).toBe('phrase');
      expect(result?.context).toBeNull();
    });
  });

  describe('word mode — single word selected', () => {
    it('returns word mode for single selected word', () => {
      const result = extractTextTarget('bonjour', null, 'Je dis bonjour le matin.');
      expect(result).toEqual({
        text: 'bonjour',
        context: 'Je dis bonjour le matin.',
        mode: 'word',
      });
    });

    it('captures sentence context', () => {
      const result = extractTextTarget('hello', null, 'Say hello to everyone.');
      expect(result?.context).toBe('Say hello to everyone.');
    });
  });

  describe('word mode — no selection', () => {
    it('falls back to wordUnderCursor when selection is empty', () => {
      const result = extractTextTarget('', 'merci', 'Je vous dis merci.');
      expect(result?.text).toBe('merci');
      expect(result?.mode).toBe('word');
    });

    it('returns null when both selection and wordUnderCursor are empty', () => {
      const result = extractTextTarget('', null, null);
      expect(result).toBeNull();
    });

    it('returns null when extracted word is pathologically long', () => {
      const huge = 'a'.repeat(100);
      expect(extractTextTarget(huge, null, null)).toBeNull();
      expect(extractTextTarget('', huge, 'context')).toBeNull();
    });
  });
});
