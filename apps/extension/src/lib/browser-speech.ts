export type BrowserSpeechScope = Window & {
  SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance;
};

export function canUseBrowserSpeech(scope: Window = window): boolean {
  const browserScope = scope as BrowserSpeechScope;
  return (
    typeof scope.speechSynthesis?.speak === 'function' &&
    typeof browserScope.SpeechSynthesisUtterance === 'function'
  );
}

function normalizedLanguage(language: string): string {
  return language.trim().toLowerCase().split(/[_-]/)[0] ?? language;
}

/**
 * Plays text with the browser/OS speech service. This is preview-only: unlike
 * pronunciation artifacts, browser speech cannot be attached to an Anki note.
 */
export function speakWithBrowser(
  text: string,
  language: string,
  scope: Window = window,
  signal?: AbortSignal,
): Promise<void> {
  if (!canUseBrowserSpeech(scope)) {
    return Promise.reject(new Error('Speech playback is unavailable in this browser.'));
  }

  const browserScope = scope as BrowserSpeechScope;
  const speech = browserScope.speechSynthesis;
  const utterance = new browserScope.SpeechSynthesisUtterance(text);
  const requestedLanguage = normalizedLanguage(language);
  const matchingVoice = speech
    .getVoices()
    .find(voice => normalizedLanguage(voice.lang) === requestedLanguage);

  utterance.lang = language;
  if (matchingVoice) utterance.voice = matchingVoice;

  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => {
      speech.cancel();
      finish();
    };
    signal?.addEventListener('abort', cancel, { once: true });

    utterance.onend = () => finish();
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (event.error === 'canceled' || event.error === 'interrupted') {
        finish();
        return;
      }
      finish(new Error('Could not play the translated text.'));
    };

    try {
      speech.cancel();
      speech.speak(utterance);
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Could not play the translated text.'));
    }
  });
}

export function stopBrowserSpeech(scope: Window = window): void {
  scope.speechSynthesis?.cancel();
}
