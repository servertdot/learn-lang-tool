const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);
const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Meta'] as const;

const IGNORED_KEYS = new Set([
  'Escape',
  'Tab',
  'Dead',
  'Unidentified',
  'Process',
]);

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function normalizeHotkeyKey(key: string): string {
  if (isModifierKey(key)) return key;
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function heldModifiers(event: KeyboardEvent): string[] {
  const held: string[] = [];
  if (event.ctrlKey) held.push('Control');
  if (event.altKey) held.push('Alt');
  if (event.shiftKey) held.push('Shift');
  if (event.metaKey) held.push('Meta');
  return held;
}

/**
 * Build a canonical chord string from a keyboard event.
 * Modifier-only chords are order-independent: Ctrl then Alt and Alt then Ctrl
 * both become "Control+Alt".
 */
export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (IGNORED_KEYS.has(event.key)) return null;

  const key = normalizeHotkeyKey(event.key);
  if (!key) return null;

  if (isModifierKey(key)) {
    const held = new Set(heldModifiers(event));
    held.add(key);
    return canonicalizeHotkey([...held]);
  }

  return canonicalizeHotkey([...heldModifiers(event), key]);
}

export function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').filter(Boolean);
}

export function canonicalizeHotkey(parts: string[]): string {
  const normalized = parts.map(normalizeHotkeyKey).filter(Boolean);
  if (normalized.length === 0) return '';

  if (normalized.every(isModifierKey)) {
    const mods = new Set(normalized);
    return MODIFIER_ORDER.filter(mod => mods.has(mod)).join('+');
  }

  const key = normalized[normalized.length - 1];
  if (!key || isModifierKey(key)) return '';

  const mods = new Set(normalized.slice(0, -1).filter(isModifierKey));
  const orderedMods = MODIFIER_ORDER.filter(mod => mods.has(mod));
  return [...orderedMods, key].join('+');
}

export function isModifierOnlyHotkey(hotkey: string): boolean {
  const parts = parseHotkey(hotkey);
  return parts.length > 0 && parts.every(isModifierKey);
}

export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const chord = hotkeyFromKeyboardEvent(event);
  return chord !== null && chord === canonicalizeHotkey(parseHotkey(hotkey));
}

export function formatHotkeyLabel(hotkey: string): string {
  return canonicalizeHotkey(parseHotkey(hotkey)).split('+').join(' + ');
}
