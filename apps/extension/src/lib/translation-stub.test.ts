import { describe, it, expect } from 'vitest';
import { translateWithStub } from './translation-stub';

describe('translateWithStub', () => {
  it('returns a deterministic labelled translation', () => {
    expect(translateWithStub('hello world', 'en', 'ru')).toBe('[en→ru] hello world');
  });
});
