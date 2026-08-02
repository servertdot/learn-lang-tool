import { describe, expect, it, vi } from 'vitest';
import type { PronunciationWorkflowInput } from './pronunciation-workflow';
import { playPronunciationPreview } from './pronunciation-preview';

const input: PronunciationWorkflowInput = {
  requestId: 'preview-1',
  text: 'hola',
  language: 'es',
  translationProvider: 'google',
  purpose: 'preview',
};

describe('playPronunciationPreview', () => {
  it('continues after artifact playback-start failure and reaches Web Speech once', async () => {
    const prepare = vi
      .fn()
      .mockResolvedValueOnce({
        requestId: 'preview-1',
        uiState: 'ready',
        artifactKey: 'pron:google',
        providerId: 'google-translate-web',
        playbackKind: 'artifact',
      })
      .mockResolvedValueOnce({
        requestId: 'preview-1',
        uiState: 'ready',
        providerId: 'web-speech',
        playbackKind: 'web_speech',
      });
    const playArtifact = vi.fn().mockRejectedValue(new Error('audio could not start'));
    const playWebSpeech = vi.fn().mockResolvedValue(undefined);

    const state = await playPronunciationPreview(input, {
      prepare,
      playArtifact,
      playWebSpeech,
      stop: vi.fn().mockResolvedValue(undefined),
    });

    expect(prepare).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ excludedProviderIds: ['google-translate-web'] }),
      expect.any(AbortSignal),
    );
    expect(playArtifact).toHaveBeenCalledWith('pron:google', expect.any(AbortSignal));
    expect(playWebSpeech).toHaveBeenCalledWith('hola', 'es', expect.any(AbortSignal));
    expect(state).toMatchObject({ uiState: 'stopped', providerId: 'web-speech' });
  });

  it('does not start another provider after deliberate cancellation', async () => {
    const controller = new AbortController();
    const prepare = vi.fn().mockResolvedValue({
      requestId: 'preview-1',
      uiState: 'ready',
      artifactKey: 'pron:google',
      providerId: 'google-translate-web',
      playbackKind: 'artifact',
    });
    const playArtifact = vi.fn((_key: string, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
    );
    const playWebSpeech = vi.fn();

    const pending = playPronunciationPreview(
      input,
      { prepare, playArtifact, playWebSpeech, stop: vi.fn().mockResolvedValue(undefined) },
      controller.signal,
    );
    await vi.waitFor(() => expect(playArtifact).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      uiState: 'stopped',
      errorCode: 'request_cancelled',
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(playWebSpeech).not.toHaveBeenCalled();
  });
});
