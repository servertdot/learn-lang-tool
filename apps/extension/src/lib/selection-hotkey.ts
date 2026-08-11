import { registerHoldHotkey } from './hold-hotkey';

export interface HotkeySelection {
  text: string;
  pageUrl?: string;
}

interface SelectionHotkeyOptions {
  getHotkey(): Promise<string>;
  readSelection(): HotkeySelection | null;
  translateSelection(selection: HotkeySelection): Promise<unknown>;
  onError?(error: unknown): void;
}

/**
 * Register the configured translation hotkey on extension-owned pages, where
 * Chrome does not inject the normal LLT content script.
 */
export async function registerSelectionHotkey(
  target: Window,
  options: SelectionHotkeyOptions,
): Promise<() => void> {
  const hotkey = await options.getHotkey();

  return registerHoldHotkey(target, {
    getHotkey: () => hotkey,
    isReady: () => true,
    onPress: () => {
      const selection = options.readSelection();
      if (!selection) return;

      void options.translateSelection(selection).catch(error => options.onError?.(error));
    },
  });
}
