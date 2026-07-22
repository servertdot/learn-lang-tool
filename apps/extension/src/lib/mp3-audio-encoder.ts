import { createMp3Encoder } from 'wasm-media-encoders';

export const MP3_BITRATE_KBPS = 64;
export const MP3_SAMPLE_RATE_HZ = 24_000;
const MP3_FRAME_SAMPLES = 1152;

let encoderPromise: ReturnType<typeof createMp3Encoder> | null = null;
let encodingQueue: Promise<void> = Promise.resolve();

function getEncoder(): ReturnType<typeof createMp3Encoder> {
  encoderPromise ??= createMp3Encoder();
  return encoderPromise;
}

async function encode(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  const encoder = await getEncoder();
  encoder.configure({
    channels: 1,
    sampleRate,
    outputSampleRate: MP3_SAMPLE_RATE_HZ,
    bitrate: MP3_BITRATE_KBPS,
  });

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const append = (chunk: Uint8Array) => {
    if (chunk.byteLength === 0) return;
    const copy = chunk.slice();
    chunks.push(copy);
    byteLength += copy.byteLength;
  };

  for (let offset = 0; offset < samples.length; offset += MP3_FRAME_SAMPLES) {
    append(encoder.encode([samples.subarray(offset, offset + MP3_FRAME_SAMPLES)]));
  }
  append(encoder.finalize());

  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Encode mono Float32 PCM as a 24 kHz, 64 kbps MP3 stream. */
export function encodeMonoMp3(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  const operation = encodingQueue.then(() => encode(samples, sampleRate));
  encodingQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
