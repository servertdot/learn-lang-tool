import { describe, expect, it, vi } from 'vitest';
import {
  openExtensionOptionsPage,
  requestOpenExtensionOptions,
} from './open-extension-options';

describe('requestOpenExtensionOptions', () => {
  it('delegates opening options to the background from a content-script runtime', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });

    await requestOpenExtensionOptions({ sendMessage });

    expect(sendMessage).toHaveBeenCalledWith({ type: 'llt.openOptionsPage' });
  });

  it('opens the options page in the background context', async () => {
    const openOptionsPage = vi.fn().mockResolvedValue(undefined);

    await openExtensionOptionsPage(openOptionsPage);

    expect(openOptionsPage).toHaveBeenCalledOnce();
  });
});
