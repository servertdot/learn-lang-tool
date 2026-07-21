import { describe, it, expect } from 'vitest';
import { normalizeText } from './normalize-text';

describe('normalizeText', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('replaces newlines with spaces', () => {
    expect(normalizeText('hello\nworld')).toBe('hello world');
  });

  it('handles multiple newlines', () => {
    expect(normalizeText('a\n\nb')).toBe('a  b');
  });

  it('trims after newline replacement', () => {
    expect(normalizeText('\n hello \n')).toBe('hello');
  });

  it('leaves already-clean text unchanged', () => {
    expect(normalizeText('clean text')).toBe('clean text');
  });
});
