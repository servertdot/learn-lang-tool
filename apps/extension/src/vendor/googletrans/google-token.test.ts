import { describe, expect, it } from 'vitest';
import { getGoogleTranslateToken } from './google-token';

describe('vendored googletrans token calculation', () => {
  it('matches googletrans 1.0.28 for ASCII input', () => {
    expect(getGoogleTranslateToken('how to refactor code efficiently and without pain')).toBe(
      '549870.939930',
    );
  });

  it('matches googletrans 1.0.28 for Unicode and surrogate pairs', () => {
    expect(getGoogleTranslateToken('привет 😀')).toBe('850775.708387');
  });
});
