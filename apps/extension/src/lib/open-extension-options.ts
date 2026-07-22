import type { LltMessage, OpenOptionsPageResponse } from './extension-messages';

interface ContentScriptRuntime {
  sendMessage(message: LltMessage): Promise<unknown>;
}

export async function requestOpenExtensionOptions(
  runtime: ContentScriptRuntime = chrome.runtime,
): Promise<void> {
  const message: LltMessage = { type: 'llt.openOptionsPage' };
  const response = (await runtime.sendMessage(message)) as OpenOptionsPageResponse | undefined;
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Could not open extension settings.');
  }
}

export async function openExtensionOptionsPage(
  openOptionsPage: () => Promise<void> = () => chrome.runtime.openOptionsPage(),
): Promise<void> {
  await openOptionsPage();
}
