import type { LltMessage } from '@src/lib/extension-messages';
import {
  cancelBergamotModelPackInstall,
  translateWithBergamot,
  warmBergamotEngine,
} from '@src/lib/bergamot-engine';
import { translateWithStub } from '@src/lib/translation-stub';
import { lltError, lltLog } from '@src/lib/debug-log';

/** Product uses Bergamot; stub remains available for demos via this flag. */
const TRANSLATION_ENGINE_MODE = 'bergamot' as 'bergamot' | 'stub';

/** Fail loud instead of hanging the popover forever if WASM/worker stalls. */
const TRANSLATE_TIMEOUT_MS = 90_000;

const translateAborts = new Map<string, AbortController>();

lltLog('offscreen', 'document loaded', { engine: TRANSLATION_ENGINE_MODE });

if (TRANSLATION_ENGINE_MODE === 'bergamot') {
  void warmBergamotEngine()
    .then(() => lltLog('offscreen', 'bergamot warm-up ok'))
    .catch(err => lltError('offscreen', 'bergamot warm-up failed', err));
}

chrome.runtime.onMessage.addListener((message: LltMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === 'llt.offscreen.abortTranslate') {
        lltLog('offscreen', 'abort', message.requestId);
        translateAborts.get(message.requestId)?.abort();
        translateAborts.delete(message.requestId);
        sendResponse({ ok: true as const });
        return;
      }

      if (message.type === 'llt.offscreen.translate') {
        const { request, requestId } = message;
        lltLog('offscreen', 'translate →', {
          requestId,
          text: request.text.slice(0, 120),
          textLen: request.text.length,
          pair: `${request.from_code}→${request.to_code}`,
        });

        const controller = new AbortController();
        if (requestId) {
          translateAborts.set(requestId, controller);
        }

        const timeout = setTimeout(() => {
          lltError('offscreen', 'translate timeout', TRANSLATE_TIMEOUT_MS);
          controller.abort();
        }, TRANSLATE_TIMEOUT_MS);

        try {
          const started = performance.now();
          const translated =
            TRANSLATION_ENGINE_MODE === 'stub'
              ? translateWithStub(request.text, request.from_code, request.to_code)
              : await translateWithBergamot(
                  request.text,
                  request.from_code,
                  request.to_code,
                  controller.signal,
                );

          lltLog('offscreen', 'translate ←', {
            ms: Math.round(performance.now() - started),
            translated: translated.slice(0, 120),
          });

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
          clearTimeout(timeout);
          if (requestId) {
            translateAborts.delete(requestId);
          }
        }
        return;
      }

      // Install runs in the service worker; keep cancel hook for safety.
      if (message.type === 'llt.offscreen.cancelInstall') {
        cancelBergamotModelPackInstall();
        sendResponse({ ok: true as const });
        return;
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Offscreen failure';
      lltError('offscreen', 'failure', messageText);
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        messageText.toLowerCase().includes('abort');
      sendResponse({
        ok: false as const,
        error: aborted ? `Translation timed out or was cancelled (${messageText})` : messageText,
        aborted,
      });
    }
  })();

  return true;
});
