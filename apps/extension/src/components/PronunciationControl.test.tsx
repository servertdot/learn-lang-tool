import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PronunciationControl } from './PronunciationControl';

describe('PronunciationControl', () => {
  it('shows preparing copy and accessible name while audio is generated', () => {
    const html = renderToStaticMarkup(
      <PronunciationControl state="preparing" onPlay={vi.fn()} />,
    );
    expect(html).toContain('Preparing audio…');
    expect(html).toContain('aria-label="Preparing pronunciation"');
  });

  it('exposes play and stop labels for ready and playing states', () => {
    expect(
      renderToStaticMarkup(<PronunciationControl state="ready" onPlay={vi.fn()} />),
    ).toContain('aria-label="Play pronunciation"');
    expect(
      renderToStaticMarkup(<PronunciationControl state="playing" onStop={vi.fn()} />),
    ).toContain('aria-label="Stop pronunciation"');
  });

  it('offers retry after failure and download when the speech pack is missing', () => {
    expect(
      renderToStaticMarkup(<PronunciationControl state="failed" onRetry={vi.fn()} />),
    ).toContain('aria-label="Retry pronunciation"');
    expect(
      renderToStaticMarkup(
        <PronunciationControl
          state="pack_missing"
          approxSizeBytes={90 * 1024 * 1024}
          onInstallSpeechPack={vi.fn()}
        />,
      ),
    ).toContain('aria-label="Download speech model"');
  });
});
