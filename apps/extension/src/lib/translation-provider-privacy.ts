import type { TranslationProvider } from '@package/shared';

export function translationProviderPrivacyCopy(provider: TranslationProvider): string {
  switch (provider) {
    case 'google':
      return "Translation sends the selected text directly to Google's unofficial translation endpoint. Pronunciation may separately send the exact visible original or translated text directly to Google's unofficial TTS endpoint. These services may be rate-limited, changed, or unavailable.";
    case 'bergamot':
      return 'Selected text stays on this device for translation. Bergamot mode never invokes Google TTS; pronunciation uses a compatible installed Kokoro provider or browser Web Speech.';
    case 'mymemory':
      return 'MyMemory receives the selected text and language pair. Each selection can contain up to 500 bytes of UTF-8 text.';
    case 'microsoft':
      return 'The extension sends the selected text directly to Microsoft Translator using your Azure resource key.';
    case 'deepl':
      return 'Your local proxy forwards the selected text to DeepL for translation.';
  }
}
