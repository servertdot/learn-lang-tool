import { describe, expect, it } from 'vitest';
import {
  encodeMonoMp3,
  MP3_BITRATE_KBPS,
  MP3_SAMPLE_RATE_HZ,
} from './mp3-audio-encoder';

describe('encodeMonoMp3', () => {
  it('encodes Kokoro PCM into a compact MP3 stream', async () => {
    const sampleRate = MP3_SAMPLE_RATE_HZ;
    const samples = Float32Array.from(
      { length: sampleRate },
      (_, index) => Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.25,
    );

    const encoded = await encodeMonoMp3(samples, sampleRate);

    expect(MP3_BITRATE_KBPS).toBe(64);
    expect(MP3_SAMPLE_RATE_HZ).toBe(24_000);
    expect(encoded.byteLength).toBeGreaterThan(1_000);
    expect(encoded.byteLength).toBeLessThan(samples.byteLength / 2);
    expect(encoded[0]).toBe(0xff);
    expect((encoded[1] ?? 0) & 0xe0).toBe(0xe0);
  });
});
