/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  extractSentenceAround,
  resolveTextCaret,
  getWordAtRange,
  getWordRangeAtRange,
} from './word-at-caret';

describe('extractSentenceAround', () => {
  it('returns the sentence containing the offset', () => {
    const text = 'Hello world. Second sentence! Third.';
    expect(extractSentenceAround(text, 2)).toBe('Hello world.');
    expect(extractSentenceAround(text, 20)).toBe('Second sentence!');
  });

  it('does not return an entire long article as context', () => {
    const text = 'a'.repeat(2000);
    const result = extractSentenceAround(text, 1000);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(400);
  });
});

describe('resolveTextCaret', () => {
  it('uses character offset inside a text node', () => {
    document.body.innerHTML = '<p id="p">hello world</p>';
    const textNode = document.getElementById('p')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 7);
    range.collapse(true);

    const caret = resolveTextCaret(range);
    expect(caret?.node).toBe(textNode);
    expect(caret?.offset).toBe(7);
  });

  it('resolves element+childIndex to the child text node', () => {
    document.body.innerHTML = '<p id="p"><span>hello</span><span>world</span></p>';
    const p = document.getElementById('p')!;
    const range = document.createRange();
    range.setStart(p, 1); // second child <span>world</span>
    range.collapse(true);

    const caret = resolveTextCaret(range);
    expect(caret?.node.textContent).toBe('world');
    expect(caret?.offset).toBe(0);
  });
});

describe('getWordAtRange', () => {
  it('extracts only the word under the caret', () => {
    document.body.innerHTML = '<p id="p">one two three</p>';
    const textNode = document.getElementById('p')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 5); // inside "two"
    range.collapse(true);

    const { word, sentence } = getWordAtRange(range);
    expect(word).toBe('two');
    expect(sentence).toContain('two');
  });

  it('expands the caret to a range containing only that word', () => {
    document.body.innerHTML = '<p id="p">one two three</p>';
    const textNode = document.getElementById('p')!.firstChild as Text;
    const caret = document.createRange();
    caret.setStart(textNode, 5);
    caret.collapse(true);

    const result = getWordRangeAtRange(caret);

    expect(result.word).toBe('two');
    expect(result.range?.toString()).toBe('two');
  });
});
