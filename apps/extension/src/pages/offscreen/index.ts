import type { LltMessage } from '@src/lib/extension-messages';
import {
  cancelBergamotModelPackInstall,
  installBergamotModelPack,
  translateWithBergamot,
} from '@src/lib/bergamot-engine';
import { translateWithStub } from '@src/lib/translation-stub';
import { MODEL_PACK_REGISTRY } from '@src/lib/model-pack-registry';

/** Product uses Bergamot; stub remains available for demos via this flag. */
const TRANSLATION_ENGINE_MODE = 'bergamot' as 'bergamot' | 'stub';

const translateAborts = new Map<string, AbortController>();

function packLanguages(packId: string): { from: string; to: string } | null {
  const pack = MODEL_PACK_REGISTRY.find(entry => entry.id === packId);
  if (!pack) return null;
  return { from: pack.from_code, to: pack.to_code };
}

chrome.runtime.onMessage.addListener((message: LltMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === 'llt.offscreen.abortTranslate') {
        translateAborts.get(message.requestId)?.abort();
        translateAborts.delete(message.requestId);
        sendResponse({ ok: true as const });
        return;
      }

      if (message.type === 'llt.offscreen.translate') {
        const { request, requestId } = message;
        const controller = new AbortController();
        if (requestId) {
          translateAborts.set(requestId, controller);
        }

        try {
          const translated =
            TRANSLATION_ENGINE_MODE === 'stub'
              ? translateWithStub(request.text, request.from_code, request.to_code)
              : await translateWithBergamot(
                  request.text,
                  request.from_code,
                  request.to_code,
                  controller.signal,
                );

          sendResponse({
            ok: true as const,
            result: {
              source_text: request.text,
              translated_text: translated,
              from_code: request.from_code,
              to_code: request.to_code,
              can_add_to_anki: true,
            },
          });
        } finally {
          if (requestId) {
            translateAborts.delete(requestId);
          }
        }
        return;
      }

      if (message.type === 'llt.offscreen.install') {
        const langs = packLanguages(message.packId);
        if (!langs) {
          sendResponse({ ok: false as const, error: 'Unknown model pack' });
          return;
        }
        await installBergamotModelPack(langs.from, langs.to);
        sendResponse({ ok: true as const });
        return;
      }

      if (message.type === 'llt.offscreen.cancelInstall') {
        cancelBergamotModelPackInstall();
        sendResponse({ ok: true as const });
        return;
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Offscreen failure';
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        messageText.toLowerCase().includes('abort');
      sendResponse({
        ok: false as const,
        error: messageText,
        aborted,
      });
    }
  })();

  return true;
});
