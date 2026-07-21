import { describe, expect, it, vi } from 'vitest';
import { createGoogleTranslationEngine } from './google-translation-engine';

describe('Google translation engine', () => {
  it('maps the upstream result to the shared translation contract', async () => {
    const engine = createGoogleTranslationEngine({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify([[['привет', 'hello']], null, 'en']), { status: 200 }),
      ),
    });

    await expect(
      engine.translate({ text: 'hello', from_code: 'en', to_code: 'ru' }),
    ).resolves.toEqual({
      source_text: 'hello',
      translated_text: 'привет',
      from_code: 'en',
      to_code: 'ru',
      can_add_to_anki: true,
    });
  });
});
