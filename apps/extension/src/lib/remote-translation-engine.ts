import type { TranslationProvider } from '@package/shared';
import { createDeepLTranslationEngine } from './deepl-translation-engine';
import { createGoogleTranslationEngine } from './google-translation-engine';
import { createMicrosoftTranslationEngine } from './microsoft-translation-engine';
import { createMyMemoryTranslationEngine } from './mymemory-translation-engine';
import type { TranslationEngine } from './translation-facade';
import { readTranslationProviderSettings } from './translation-provider-settings';

export async function getRemoteTranslationEngine(
  provider: Exclude<TranslationProvider, 'bergamot'>,
): Promise<TranslationEngine> {
  switch (provider) {
    case 'google':
      return createGoogleTranslationEngine();
    case 'deepl':
      return createDeepLTranslationEngine();
    case 'mymemory': {
      const { myMemoryEmail } = await readTranslationProviderSettings();
      return createMyMemoryTranslationEngine({ email: myMemoryEmail });
    }
    case 'microsoft': {
      const { microsoftKey, microsoftRegion } = await readTranslationProviderSettings();
      return createMicrosoftTranslationEngine({ key: microsoftKey, region: microsoftRegion });
    }
  }
}
