import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public/ort');
const require = createRequire(import.meta.url);

const FILES = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

/**
 * ONNX Runtime WASM assets must ship inside the extension package.
 * Transformers.js otherwise defaults to cdn.jsdelivr.net, which MV3 CSP blocks.
 */
function resolveOrtSourceDir() {
  try {
    const transformersEntry = require.resolve('@huggingface/transformers');
    const dist = join(dirname(transformersEntry), 'dist');
    if (FILES.every(file => existsSync(join(dist, file)))) {
      return dist;
    }
  } catch {
    // fall through
  }

  try {
    const kokoroDir = dirname(require.resolve('kokoro-js'));
    const transformersEntry = require.resolve('@huggingface/transformers', {
      paths: [kokoroDir],
    });
    const dist = join(dirname(transformersEntry), 'dist');
    if (FILES.every(file => existsSync(join(dist, file)))) {
      return dist;
    }
  } catch {
    // fall through
  }

  return null;
}

const src = resolveOrtSourceDir();
if (!src) {
  console.warn('[copy-ort-assets] ORT WASM source not found; skip');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  cpSync(join(src, file), join(dest, file));
}

console.log('[copy-ort-assets] copied ORT WASM assets to public/ort from', src);
