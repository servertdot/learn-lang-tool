import { describe, expect, it } from 'vitest';
import { configureKokoroOrtWasmPaths } from './kokoro-tts-provider';

describe('configureKokoroOrtWasmPaths', () => {
  it('points ONNX Runtime at extension-packaged ort assets, not a CDN', () => {
    const env = { wasmPaths: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/' };
    configureKokoroOrtWasmPaths(env, path => `chrome-extension://id/${path}`);

    expect(env.wasmPaths).toBe('chrome-extension://id/ort/');
    expect(String(env.wasmPaths)).not.toContain('jsdelivr');
  });
});
