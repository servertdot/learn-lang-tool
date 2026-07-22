import { describe, expect, it } from 'vitest';
import { configureKokoroOrtRuntime } from './kokoro-tts-provider';

describe('configureKokoroOrtRuntime', () => {
  it('points ONNX Runtime at packaged ort assets and disables thread workers', () => {
    const kokoroEnv = {
      wasmPaths: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
    };
    const transformersEnv = {
      backends: {
        onnx: {
          wasm: {
            wasmPaths: kokoroEnv.wasmPaths,
            numThreads: 4,
            proxy: true,
          },
        },
      },
    };

    configureKokoroOrtRuntime(kokoroEnv, transformersEnv, path => `chrome-extension://id/${path}`);

    expect(kokoroEnv.wasmPaths).toBe('chrome-extension://id/ort/');
    expect(transformersEnv.backends.onnx.wasm.wasmPaths).toBe('chrome-extension://id/ort/');
    expect(transformersEnv.backends.onnx.wasm.numThreads).toBe(1);
    expect(transformersEnv.backends.onnx.wasm.proxy).toBe(false);
    expect(String(kokoroEnv.wasmPaths)).not.toContain('jsdelivr');
  });
});
