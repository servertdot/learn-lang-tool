import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PopupTranslationResult } from './PopupTranslationResult';

const result = {
  source_text: 'hello',
  translated_text: 'привет',
  from_code: 'en',
  to_code: 'ru',
  can_add_to_anki: true,
};

describe('PopupTranslationResult', () => {
  it('shows the Add to Anki action for a translated PDF selection', () => {
    const html = renderToStaticMarkup(
      <PopupTranslationResult
        result={result}
        ankiState="idle"
        ankiViewState="idle"
        ankiError={null}
        onAddToAnki={vi.fn()}
        onViewInAnki={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Add to Anki"');
    expect(html).toContain('aria-label="Open settings"');
    expect(html).not.toContain('aria-label="View added note in Anki"');
  });

  it('shows a play action for translated text', () => {
    const html = renderToStaticMarkup(
      <PopupTranslationResult
        result={result}
        ankiState="idle"
        ankiViewState="idle"
        ankiError={null}
        onAddToAnki={vi.fn()}
        onViewInAnki={vi.fn()}
        onOpenSettings={vi.fn()}
        translatedPronunciationState="ready"
        onPlayTranslatedPronunciation={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Play translated text"');
  });

  it('shows the View in Anki action after the card is added', () => {
    const html = renderToStaticMarkup(
      <PopupTranslationResult
        result={result}
        ankiState="added"
        ankiViewState="idle"
        ankiError={null}
        onAddToAnki={vi.fn()}
        onViewInAnki={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Added to Anki"');
    expect(html).toContain('aria-label="View added note in Anki"');
  });

  it('shows that the card is queued when Anki is closed', () => {
    const html = renderToStaticMarkup(
      <PopupTranslationResult
        result={result}
        ankiState="queued"
        ankiViewState="idle"
        ankiError={null}
        onAddToAnki={vi.fn()}
        onViewInAnki={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(html).toContain('Saved locally. It will sync when Anki is open.');
  });
});
