import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TranslationPopover } from './TranslationPopover';

describe('TranslationPopover', () => {
  it('shows a lightweight result layout with compact Anki actions', () => {
    const html = renderToStaticMarkup(
      <TranslationPopover
        state={{
          kind: 'success',
          data: {
            source_text: 'hello',
            translated_text: 'привет',
            from_code: 'source-code',
            to_code: 'target-code',
            can_add_to_anki: true,
          },
        }}
        position={{ x: 0, y: 0 }}
        ankiState="added"
        onAddToAnki={vi.fn()}
        onViewInAnki={vi.fn()}
        onOpenSettings={vi.fn()}
        pronunciationState="ready"
        translatedPronunciationState="ready"
        onPlayPronunciation={vi.fn()}
        onPlayTranslatedPronunciation={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Added to Anki"');
    expect(html).toContain('aria-label="View added note in Anki"');
    expect(html).toContain('aria-label="Open settings"');
    expect(html).toContain('aria-label="Play original text"');
    expect(html).toContain('aria-label="Play translated text"');
    expect(html).toContain('Translation');
    expect(html).toContain('Original');
    expect(html).toContain('привет');
    expect(html).toContain('hello');
    expect(html).not.toContain('source-code');
    expect(html).not.toContain('target-code');
  });

  it('shows preparing pronunciation beside the original text', () => {
    const html = renderToStaticMarkup(
      <TranslationPopover
        state={{
          kind: 'success',
          data: {
            source_text: 'hello',
            translated_text: 'привет',
            from_code: 'en',
            to_code: 'ru',
            can_add_to_anki: true,
          },
        }}
        position={{ x: 0, y: 0 }}
        onOpenSettings={vi.fn()}
        pronunciationState="preparing"
      />,
    );

    expect(html).toContain('Preparing audio…');
    expect(html).toContain('aria-label="Preparing original text"');
  });

  it('shows Anki audio preparation and exposes a distinct retry action on failure', () => {
    const html = renderToStaticMarkup(
      <TranslationPopover
        state={{
          kind: 'success',
          data: {
            source_text: 'hello',
            translated_text: 'привет',
            from_code: 'en',
            to_code: 'ru',
            can_add_to_anki: true,
          },
        }}
        position={{ x: 0, y: 0 }}
        onOpenSettings={vi.fn()}
        ankiPronunciationState="failed"
        onRetryAnkiPronunciation={vi.fn()}
      />,
    );

    expect(html).toContain('Couldn’t prepare pronunciation for Anki.');
    expect(html).toContain('aria-label="Retry Anki pronunciation"');
  });

  it('explains that a card is safely queued while Anki is closed', () => {
    const html = renderToStaticMarkup(
      <TranslationPopover
        state={{
          kind: 'success',
          data: {
            source_text: 'hello',
            translated_text: 'привет',
            from_code: 'en',
            to_code: 'ru',
            can_add_to_anki: true,
          },
        }}
        position={{ x: 0, y: 0 }}
        ankiState="queued"
        onAddToAnki={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Saved for later Anki sync"');
    expect(html).toContain('Saved locally. It will sync when Anki is open.');
  });
});
