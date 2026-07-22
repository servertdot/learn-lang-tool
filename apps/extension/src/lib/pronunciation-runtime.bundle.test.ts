import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('pronunciation runtime service worker bundle', () => {
  it('does not use dynamic imports that require Vite’s DOM preload helper', async () => {
    const source = await readFile(new URL('./pronunciation-runtime.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/\bawait\s+import\s*\(/);
  });
});
