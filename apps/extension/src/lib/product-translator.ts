import { MAX_TRANSLATION_TEXT_LENGTH } from '@package/shared';
import { createTranslationFacade, type TranslationFacade } from './translation-facade';
import { createMessagingTranslationEngine } from './messaging-translation-engine';

/** Product-path facade: local translation engine via extension messaging. */
export function createProductTranslationFacade(): TranslationFacade {
  return createTranslationFacade(createMessagingTranslationEngine(), {
    maxLength: MAX_TRANSLATION_TEXT_LENGTH,
  });
}
