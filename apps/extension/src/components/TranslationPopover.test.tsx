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
      />,
    );

    expect(html).toContain('aria-label="Added to Anki"');
    expect(html).toContain('aria-label="View added note in Anki"');
    expect(html).toContain('Translation');
    expect(html).toContain('Original');
    expect(html).toContain('привет');
    expect(html).toContain('hello');
    expect(html).not.toContain('source-code');
    expect(html).not.toContain('target-code');
  });
});
