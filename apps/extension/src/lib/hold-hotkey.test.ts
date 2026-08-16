// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { registerHoldHotkey } from './hold-hotkey';

describe('registerHoldHotkey', () => {
  it('sees the hotkey before an editor stops the bubbling event', () => {
    const onPress = vi.fn();
    const unregister = registerHoldHotkey(window, {
      getHotkey: () => 'Alt',
      isReady: () => true,
      onPress,
    });
    document.addEventListener('keydown', event => event.stopPropagation(), { once: true });

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true, composed: true }),
    );

    expect(onPress).toHaveBeenCalledOnce();
    unregister();
  });

  it('ignores repeats, other keys, and events before settings are ready', () => {
    const onPress = vi.fn();
    let ready = false;
    const unregister = registerHoldHotkey(window, {
      getHotkey: () => 'Alt',
      isReady: () => ready,
      onPress,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    ready = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, repeat: true }));

    expect(onPress).not.toHaveBeenCalled();
    unregister();
  });

  it('matches modifier combinations', () => {
    const onPress = vi.fn();
    const unregister = registerHoldHotkey(window, {
      getHotkey: () => 'Control+Alt',
      isReady: () => true,
      onPress,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    expect(onPress).not.toHaveBeenCalled();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', altKey: true, ctrlKey: true }),
    );
    expect(onPress).toHaveBeenCalledOnce();
    unregister();
  });
});
