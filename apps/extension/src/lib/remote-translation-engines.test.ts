import { describe, expect, it, vi } from 'vitest';
import { createMicrosoftTranslationEngine } from './microsoft-translation-engine';
import { createMyMemoryTranslationEngine } from './mymemory-translation-engine';

const request = { text: 'hello & goodbye?', from_code: 'en', to_code: 'ru' };
const myMemorySuccess = { responseStatus: 200, responseData: { translatedText: 'привет и пока?' } };

describe('MyMemory translation', () => {
  it.each([[undefined, null], [' user@example.org ', 'user@example.org']])(
    'sends only selected text, language pair and the configured contact (%s)', async (email, contact) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(myMemorySuccess));
      const result = await createMyMemoryTranslationEngine({ email: email ?? undefined, fetch: fetchMock }).translate(request);
      expect(result).toEqual({
        source_text: request.text, translated_text: 'привет и пока?', from_code: 'en', to_code: 'ru', can_add_to_anki: true,
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url.origin + url.pathname).toBe('https://api.mymemory.translated.net/get');
      expect(url.searchParams.get('q')).toBe(request.text);
      expect(url.searchParams.get('langpair')).toBe('en|ru');
      expect(url.searchParams.get('de')).toBe(contact);
      expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    },
  );

  it('applies the 500-byte limit to UTF-8 and requires an explicit source language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(myMemorySuccess));
    const engine = createMyMemoryTranslationEngine({ fetch: fetchMock });
    const atLimit = 'я'.repeat(250);
    await expect(engine.translate({ ...request, text: atLimit + '!' })).rejects.toMatchObject({ code: 'text_too_long' });
    await expect(engine.translate({ ...request, from_code: 'auto' })).rejects.toThrow('source language');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(engine.translate({ ...request, text: atLimit })).resolves.toMatchObject({ source_text: atLimit });
  });

  it.each([
    [{ ...myMemorySuccess, quotaFinished: true }, /quota/],
    [{ ...myMemorySuccess, responseStatus: '429' }, /quota/],
    [{ responseStatus: 403, responseData: { translatedText: 'INVALID EMAIL' } }, /could not translate/],
    [{ responseStatus: 200, responseData: null }, /could not translate/],
  ] as const)('rejects upstream error data as a translation (%j)', async (body, message) => {
    const engine = createMyMemoryTranslationEngine({ fetch: vi.fn().mockResolvedValue(Response.json(body)) });
    await expect(engine.translate(request)).rejects.toThrow(message);
  });

  it('keeps personal data in the request URL out of network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('failed GET ?q=selected&de=user@example.org'));
    const engine = createMyMemoryTranslationEngine({ fetch: fetchMock });
    await expect(engine.translate(request)).rejects.toThrow(/^Could not reach MyMemory\.$/);
  });
});

describe('Microsoft Translator', () => {
  it('sends credentials in headers and recognizes the source language from the same response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{
      detectedLanguage: { language: 'en' }, translations: [{ text: 'привет и пока?', to: 'ru' }],
    }]));
    const engine = createMicrosoftTranslationEngine({ key: ' my-key ', region: ' westeurope ', fetch: fetchMock });
    await expect(engine.translate({ ...request, from_code: 'auto' })).resolves.toEqual({
      source_text: request.text, translated_text: 'привет и пока?', from_code: 'en', to_code: 'ru', can_add_to_anki: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toBe('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=ru');
    expect(init).toMatchObject({
      method: 'POST', credentials: 'omit', redirect: 'error',
      body: JSON.stringify([{ Text: request.text }]),
      headers: { 'Ocp-Apim-Subscription-Key': 'my-key', 'Ocp-Apim-Subscription-Region': 'westeurope' },
    });
  });

  it('uses the explicit language pair for global resources, mapping Chinese to the supported code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ translations: [{ text: 'hello', to: 'en' }] }]));
    const engine = createMicrosoftTranslationEngine({ key: 'key', fetch: fetchMock });
    await expect(engine.translate({ text: '你好', from_code: 'zh', to_code: 'en' })).resolves.toMatchObject({ from_code: 'zh' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.searchParams.get('from')).toBe('zh-Hans');
    expect(init.headers).not.toHaveProperty('Ocp-Apim-Subscription-Region');
  });

  it('requires a key before making a request and propagates cancellation', async () => {
    const fetchMock = vi.fn();
    await expect(createMicrosoftTranslationEngine({ key: '', fetch: fetchMock }).translate(request)).rejects.toThrow('key');
    const engine = createMicrosoftTranslationEngine({ key: 'key', fetch: fetchMock });
    await expect(engine.translate(request, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores raw API error text when reporting a rejected key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('credential detail', { status: 401 }));
    const engine = createMicrosoftTranslationEngine({ key: 'key', fetch: fetchMock });
    await expect(engine.translate(request)).rejects.toThrow('Microsoft Translator request failed (HTTP 401).');
  });

  it('requires a usable detected source for pronunciation and Anki', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ translations: [{ text: 'hello' }] }]));
    const engine = createMicrosoftTranslationEngine({ key: 'key', fetch: fetchMock });
    await expect(engine.translate({ ...request, from_code: 'auto' })).rejects.toThrow('language');
  });
});
