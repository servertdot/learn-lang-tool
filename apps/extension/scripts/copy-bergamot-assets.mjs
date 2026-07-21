import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@browsermt/bergamot-translator/worker');
const dest = join(root, 'public/bergamot');

if (!existsSync(src)) {
  console.warn('[copy-bergamot-assets] package not installed yet; skip');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

/**
 * Chrome extension pages often serve .wasm without `application/wasm`, which
 * makes WebAssembly.instantiateStreaming hang/fail. Prefer ArrayBuffer +
 * WebAssembly.instantiate for MV3 offscreen workers.
 */
const workerPath = join(dest, 'translator-worker.js');
const workerSource = readFileSync(workerPath, 'utf8');
const needle = `WebAssembly.instantiateStreaming(response, {
                                ...info,
                                'wasm_gemm': this.options.useNativeIntGemm
                                    ? this.linkNativeIntGemm(info)
                                    : this.linkFallbackIntGemm(info)
                            }).then(({instance}) => accept(instance)).catch(reject);`;

const replacement = `const imports = {
                                ...info,
                                'wasm_gemm': this.options.useNativeIntGemm
                                    ? this.linkNativeIntGemm(info)
                                    : this.linkFallbackIntGemm(info)
                            };
                            // MV3: avoid instantiateStreaming MIME requirements.
                            response.arrayBuffer()
                                .then((buffer) => WebAssembly.instantiate(buffer, imports))
                                .then(({instance}) => accept(instance))
                                .catch(reject);`;

if (!workerSource.includes(needle)) {
  console.warn('[copy-bergamot-assets] WASM instantiate patch target not found; worker may have changed');
} else {
  writeFileSync(workerPath, workerSource.replace(needle, replacement));
  console.log('[copy-bergamot-assets] patched WASM instantiate for Chrome MV3');
}

console.log('[copy-bergamot-assets] copied worker assets to public/bergamot');
