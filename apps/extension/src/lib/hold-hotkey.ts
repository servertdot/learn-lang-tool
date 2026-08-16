import { matchesHotkey } from './hotkey-chord';

export interface HoldHotkeyOptions {
  getHotkey(): string;
  isReady(): boolean;
  onPress(event: KeyboardEvent): void;
}

/**
 * Register in the capture phase so canvas editors cannot swallow the hotkey
 * before the extension sees it.
 */
export function registerHoldHotkey(
  target: Window,
  options: HoldHotkeyOptions,
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || !options.isReady()) return;
    if (!matchesHotkey(event, options.getHotkey())) return;

    event.preventDefault();
    options.onPress(event);
  };

  target.addEventListener('keydown', handleKeyDown, true);
  return () => target.removeEventListener('keydown', handleKeyDown, true);
}
