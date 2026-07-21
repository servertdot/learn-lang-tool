import { cpSync, mkdirSync, existsSync } from 'node:fs';
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
console.log('[copy-bergamot-assets] copied worker assets to public/bergamot');
