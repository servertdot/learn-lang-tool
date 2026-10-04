import { describe, expect, it, vi } from 'vitest';
import { createGoogleTranslationEngine } from './google-translation-engine';

describe('Google translation engine', () => {
  it('returns the detected language for pronunciation and Anki without changing the configured pair', async () => {
    const engine = createGoogleTranslationEngine({
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify([[['привет', 'hola']], null, 'es']))),
    });
    const request = { text: 'hola', from_code: 'auto', to_code: 'ru' };
    await expect(engine.translate(request)).resolves.toMatchObject({
      source_text: 'hola', translated_text: 'привет', from_code: 'es', to_code: 'ru',
      can_add_to_anki: true,
    });
    expect(request.from_code).toBe('auto');
  });

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
