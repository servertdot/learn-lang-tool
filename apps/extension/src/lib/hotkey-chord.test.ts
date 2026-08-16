// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  canonicalizeHotkey,
  formatHotkeyLabel,
  hotkeyFromKeyboardEvent,
  isModifierOnlyHotkey,
  matchesHotkey,
} from './hotkey-chord';

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('hotkeyFromKeyboardEvent', () => {
  it('captures a single modifier', () => {
    expect(hotkeyFromKeyboardEvent(keyEvent({ key: 'Alt', altKey: true }))).toBe('Alt');
  });

  it('captures modifier combinations from either press order', () => {
    expect(
      hotkeyFromKeyboardEvent(keyEvent({ key: 'Alt', altKey: true, ctrlKey: true })),
    ).toBe('Control+Alt');
    expect(
      hotkeyFromKeyboardEvent(keyEvent({ key: 'Control', altKey: true, ctrlKey: true })),
    ).toBe('Control+Alt');
  });

  it('captures modifier plus character keys in canonical order', () => {
    expect(
      hotkeyFromKeyboardEvent(keyEvent({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true })),
    ).toBe('Control+Shift+k');
  });

  it('ignores escape and tab', () => {
    expect(hotkeyFromKeyboardEvent(keyEvent({ key: 'Escape' }))).toBeNull();
    expect(hotkeyFromKeyboardEvent(keyEvent({ key: 'Tab' }))).toBeNull();
  });
});

describe('matchesHotkey', () => {
  it('matches exact chords and rejects extra modifiers', () => {
    expect(matchesHotkey(keyEvent({ key: 'Alt', altKey: true }), 'Alt')).toBe(true);
    expect(
      matchesHotkey(keyEvent({ key: 'Alt', altKey: true, ctrlKey: true }), 'Alt'),
    ).toBe(false);
    expect(
      matchesHotkey(keyEvent({ key: 'Alt', altKey: true, ctrlKey: true }), 'Control+Alt'),
    ).toBe(true);
  });

  it('treats modifier-only chords as order-independent', () => {
    expect(
      matchesHotkey(
        keyEvent({ key: 'Control', altKey: true, ctrlKey: true }),
        'Alt+Control',
      ),
    ).toBe(true);
    expect(
      matchesHotkey(
        keyEvent({ key: 'Alt', altKey: true, ctrlKey: true }),
        'Alt+Control',
      ),
    ).toBe(true);
  });
});

describe('hotkey helpers', () => {
  it('canonicalizes modifier-only chords without a trigger key', () => {
    expect(canonicalizeHotkey(['Shift', 'Control', 'k'])).toBe('Control+Shift+k');
    expect(canonicalizeHotkey(['Alt', 'Control'])).toBe('Control+Alt');
    expect(formatHotkeyLabel('Alt+Control')).toBe('Control + Alt');
    expect(isModifierOnlyHotkey('Control+Alt')).toBe(true);
    expect(isModifierOnlyHotkey('Control+k')).toBe(false);
  });
});
