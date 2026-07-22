import { describe, expect, it, vi } from 'vitest';
import { handleTranslationTrigger } from './translation-trigger';

const hiddenFrameSource = {
  text: 'Your Company',
  kind: 'selection' as const,
  range: null,
  rect: null,
};

describe('handleTranslationTrigger', () => {
  it('relays a source from a hidden child frame instead of rendering there', async () => {
    const showSource = vi.fn();
    const relaySource = vi.fn(async () => undefined);

    await handleTranslationTrigger({
      isTopFrame: false,
      readSource: async () => hiddenFrameSource,
      showSource,
      relaySource,
    });

    expect(relaySource).toHaveBeenCalledWith({ text: 'Your Company', kind: 'selection' });
    expect(showSource).not.toHaveBeenCalled();
  });

  it('renders a source directly in the visible top frame', async () => {
    const showSource = vi.fn(async () => undefined);
    const relaySource = vi.fn();

    await handleTranslationTrigger({
      isTopFrame: true,
      readSource: async () => hiddenFrameSource,
      showSource,
      relaySource,
    });

    expect(showSource).toHaveBeenCalledWith(hiddenFrameSource);
    expect(relaySource).not.toHaveBeenCalled();
  });
});
