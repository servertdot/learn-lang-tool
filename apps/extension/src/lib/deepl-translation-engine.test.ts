import { describe, expect, it, vi } from 'vitest';
import { createDeepLTranslationEngine } from './deepl-translation-engine';

const request = { text: 'hello', from_code: 'en', to_code: 'ru' };

function mockProxy(payload: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload)));
}

describe('DeepL proxy translation', () => {
  it('sends only the text and language pair to the loopback proxy', async () => {
    const fetch = mockProxy({ translations: [{ text: 'привет', detected_source_language: 'EN' }] });
    const engine = createDeepLTranslationEngine({ fetch });
    const selected = { ...request, context: 'Keep this sentence on the device.' };
    await expect(engine.translate(selected)).resolves.toEqual({
      source_text: 'hello', translated_text: 'привет', from_code: 'en', to_code: 'ru', can_add_to_anki: true,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3000/v2/translate');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ text: ['hello'], source_lang: 'EN', target_lang: 'RU' });
  });

  it('omits auto source and returns the language detected for pronunciation and Anki', async () => {
    const fetch = mockProxy({ translations: [{ text: 'hello', detected_source_language: 'FR' }] });
    const engine = createDeepLTranslationEngine({ fetch });
    await expect(engine.translate({ text: 'salut', from_code: 'auto', to_code: 'en' })).resolves.toMatchObject({
      from_code: 'fr', to_code: 'en', translated_text: 'hello',
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ text: ['salut'], target_lang: 'EN-US' });
  });

  it.each([
    { translations: [] },
    { translations: [{ text: ' ', detected_source_language: 'EN' }] },
    { translations: [{ text: 'привет', detected_source_language: 'und' }] },
  ])('rejects an unusable result', async payload => {
    const engine = createDeepLTranslationEngine({ fetch: mockProxy(payload) });
    await expect(engine.translate({ ...request, from_code: 'auto' })).rejects.toThrow();
  });
});
