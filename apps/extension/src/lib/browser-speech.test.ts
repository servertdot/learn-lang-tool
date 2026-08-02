import { describe, expect, it, vi } from 'vitest';
import {
  canUseBrowserSpeech,
  speakWithBrowser,
  stopBrowserSpeech,
  type BrowserSpeechScope,
} from './browser-speech';

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(readonly text: string) {}
}

function createSpeechWindow() {
  const spanishVoice = { lang: 'es-ES' } as SpeechSynthesisVoice;
  const speech = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => [spanishVoice]),
    speak: vi.fn((utterance: FakeUtterance) => utterance.onend?.()),
  };
  const scope = {
    speechSynthesis: speech,
    SpeechSynthesisUtterance: FakeUtterance,
  } as unknown as BrowserSpeechScope;
  return { scope, speech, spanishVoice };
}

describe('browser speech preview', () => {
  it('plays translated text with a voice matching the target language', async () => {
    const { scope, speech, spanishVoice } = createSpeechWindow();

    await speakWithBrowser('una extensión madura', 'es', scope);

    expect(speech.cancel).toHaveBeenCalledOnce();
    const utterance = speech.speak.mock.calls[0]?.[0];
    expect(utterance).toMatchObject({
      text: 'una extensión madura',
      lang: 'es',
      voice: spanishVoice,
    });
  });

  it('reports support and can stop active browser speech', () => {
    const { scope, speech } = createSpeechWindow();

    expect(canUseBrowserSpeech(scope)).toBe(true);
    stopBrowserSpeech(scope);

    expect(speech.cancel).toHaveBeenCalledOnce();
  });

  it('settles active playback when the pronunciation request is cancelled', async () => {
    const { scope, speech } = createSpeechWindow();
    speech.speak.mockImplementation(() => undefined);
    const controller = new AbortController();

    const playback = speakWithBrowser('hola', 'es', scope, controller.signal);
    controller.abort();

    await expect(playback).resolves.toBeUndefined();
    expect(speech.cancel).toHaveBeenCalledTimes(2);
  });
});
