import type { TranslationProvider } from '@package/shared';

export function translationProviderPrivacyCopy(provider: TranslationProvider): string {
  if (provider === 'google') {
    return "Translation sends the selected text directly to Google's unofficial translation endpoint. Pronunciation may separately send the exact visible original or translated text directly to Google's unofficial TTS endpoint. These services may be rate-limited, changed, or unavailable.";
  }
  return 'Selected text stays on this device for translation. Bergamot mode never invokes Google TTS; pronunciation uses a compatible installed Kokoro provider or browser Web Speech.';
}
