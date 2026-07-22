import type { LltMessage, OffscreenResponse } from '@src/lib/extension-messages';
import {
  cancelBergamotModelPackInstall,
  translateWithBergamot,
  warmBergamotEngine,
} from '@src/lib/bergamot-engine';
import { translateWithStub } from '@src/lib/translation-stub';
import { createKokoroAudioTtsProvider } from '@src/lib/kokoro-tts-provider';
import { bytesToBase64 } from '@src/lib/pronunciation-artifact-store';
import { TtsError } from '@src/lib/audio-tts-provider';
import { lltError, lltLog } from '@src/lib/debug-log';

/** Product uses Bergamot; stub remains available for demos via this flag. */
const TRANSLATION_ENGINE_MODE = 'bergamot' as 'bergamot' | 'stub';

/** Fail loud instead of hanging the popover forever if WASM/worker stalls. */
const TRANSLATE_TIMEOUT_MS = 90_000;
const SYNTHESIZE_TIMEOUT_MS = 120_000;

const translateAborts = new Map<string, AbortController>();
const synthesizeAborts = new Map<string, AbortController>();
const kokoroProvider = createKokoroAudioTtsProvider();

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

function stopPlayback(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

function playBase64Audio(dataBase64: string, mimeType: string): Promise<void> {
  stopPlayback();
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  activeObjectUrl = url;
  const audio = new Audio(url);
  activeAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      stopPlayback();
      resolve();
    };
    audio.onerror = () => {
      stopPlayback();
      reject(new Error('Audio playback failed.'));
    };
    void audio.play().catch(error => {
      stopPlayback();
      reject(error instanceof Error ? error : new Error('Audio playback failed.'));
    });
  });
}

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
        sendResponse({ ok: true as const } satisfies OffscreenResponse);
        return;
      }

      if (message.type === 'llt.offscreen.abortSynthesize') {
        synthesizeAborts.get(message.requestId)?.abort();
        synthesizeAborts.delete(message.requestId);
        sendResponse({ ok: true as const } satisfies OffscreenResponse);
        return;
      }

      if (message.type === 'llt.offscreen.stopPlayback') {
        stopPlayback();
        sendResponse({ ok: true as const } satisfies OffscreenResponse);
        return;
      }

      if (message.type === 'llt.offscreen.playArtifact') {
        await playBase64Audio(message.dataBase64, message.mimeType);
        sendResponse({ ok: true as const } satisfies OffscreenResponse);
        return;
      }

      if (message.type === 'llt.offscreen.synthesize') {
        const { requestId, pronunciationRequest } = message;
        lltLog('offscreen', 'synthesize →', {
          requestId,
          language: pronunciationRequest.language,
          textLen: pronunciationRequest.text.length,
        });

        const controller = new AbortController();
        synthesizeAborts.set(requestId, controller);
        const timeout = setTimeout(() => controller.abort(), SYNTHESIZE_TIMEOUT_MS);

        try {
          const started = performance.now();
          const artifact = await kokoroProvider.synthesize(
            pronunciationRequest,
            controller.signal,
          );
          lltLog('offscreen', 'synthesize ←', {
            ms: Math.round(performance.now() - started),
            bytes: artifact.bytes.byteLength,
          });
          sendResponse({
            ok: true as const,
            artifact: {
              artifactKey: artifact.artifactKey,
              filename: artifact.filename,
              dataBase64: bytesToBase64(artifact.bytes),
              mimeType: artifact.mimeType,
              extension: artifact.extension,
              sampleRate: artifact.sampleRate,
              language: artifact.language,
              voiceId: artifact.voiceId,
              speed: artifact.speed,
            },
          } satisfies OffscreenResponse);
        } finally {
          clearTimeout(timeout);
          synthesizeAborts.delete(requestId);
        }
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
        messageText.toLowerCase().includes('abort') ||
        (err instanceof TtsError && err.code === 'request_cancelled');
      sendResponse({
        ok: false as const,
        error: aborted ? `Timed out or was cancelled (${messageText})` : messageText,
        aborted,
        code: err instanceof TtsError ? err.code : undefined,
      } satisfies OffscreenResponse);
    }
  })();

  return true;
});
