import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installModelPackFiles } from './model-pack-installer';

describe('installModelPackFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads registry files into Cache API', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const match = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match, put }),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('registry.json')) {
          return new Response(
            JSON.stringify({
              enru: {
                model: {
                  name: 'model.enru.bin',
                  expectedSha256Hash: 'aa'.repeat(32),
                },
                lex: {
                  name: 'lex.enru.bin',
                  expectedSha256Hash: 'bb'.repeat(32),
                },
                vocab: {
                  name: 'vocab.enru.spm',
                  expectedSha256Hash: 'cc'.repeat(32),
                },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }),
    );

    await installModelPackFiles('en', 'ru');

    expect(put).toHaveBeenCalled();
    expect(match).toHaveBeenCalled();
  });

  it('throws when language pair is missing from registry', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: vi.fn(), put: vi.fn() }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    await expect(installModelPackFiles('en', 'xx')).rejects.toThrow(/No model files/);
  });
});
