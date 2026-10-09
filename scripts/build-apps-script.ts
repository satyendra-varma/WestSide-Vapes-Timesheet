// Concatenates apps-script/src/*.js (filename order) into apps-script/Code.gs, the single file the
// owner pastes into the Apps Script editor. `--check` exits 1 if Code.gs is out of date.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'apps-script', 'src');
export const BUNDLE_PATH = join(ROOT, 'apps-script', 'Code.gs');

const HEADER = `/**
 * WestSide Vapes backend for Google Apps Script.
 * GENERATED FILE - do not edit. Source: apps-script/src/*.js, regenerate with \`npm run build:gas\`.
 * Paste this whole file into the Apps Script editor (Code.gs). Deploy steps: docs/MORNING_CHECKLIST.md.
 */
`;

const toLf = (text: string): string => text.replace(/\r\n/g, '\n');

export function bundleAppsScript(): string {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.js')).sort();
  const parts = files.map((file) => `// ---- ${file} ----\n${toLf(readFileSync(join(SRC_DIR, file), 'utf8')).trimEnd()}\n`);
  return `${HEADER}\n${parts.join('\n')}`;
}

export function readBundle(): string {
  return toLf(readFileSync(BUNDLE_PATH, 'utf8'));
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const bundle = bundleAppsScript();
  if (process.argv.includes('--check')) {
    if (readBundle() !== bundle) {
      console.error('apps-script/Code.gs is out of date. Run: npm run build:gas');
      process.exit(1);
    }
    console.log('apps-script/Code.gs is up to date.');
  } else {
    writeFileSync(BUNDLE_PATH, bundle);
    console.log(`Wrote ${BUNDLE_PATH}`);
  }
}
