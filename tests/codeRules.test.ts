// Repository rules that are easy to break by accident and expensive to miss.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const THIS_FILE = 'tests/codeRules.test.ts';

function filesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');
const read = (f: string) => readFileSync(f, 'utf8');
/** Drops Tailwind opacity classes like "border-emerald-500/60", which look like division by 60. */
const withoutCssClasses = (src: string) => src.replace(/[a-z]+(?:-[a-z]+)*-\d{2,3}\/\d{1,3}\b/g, '');

const tsFiles = ['src', 'mock-backend', 'scripts', 'tests'].flatMap((d) => filesUnder(join(ROOT, d), ['.ts', '.tsx']));
const appFiles = filesUnder(join(ROOT, 'src'), ['.ts', '.tsx']).filter((f) => !f.endsWith('.test.ts'));
const shippedFiles = [...appFiles, join(ROOT, 'apps-script', 'Code.gs')];

describe('code rules', () => {
  it('no explicit `any` in TypeScript (strict mode is on; use unknown + narrowing)', () => {
    const anyType = new RegExp([':\\s*any\\b', '\\bas\\s+any\\b', '<any>'].join('|'));
    const offenders = tsFiles.filter((f) => rel(f) !== THIS_FILE && anyType.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no hours arithmetic outside src/utils/hours.ts (DECISIONS D-001, D-022)', () => {
    const arithmetic = /toFixed\(|\/\s*60\b|\*\s*60\b|\b60\s*\*|parseFloat\(/;
    const offenders = appFiles.filter((f) => rel(f) !== 'src/utils/hours.ts' && arithmetic.test(withoutCssClasses(read(f))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no pay or wage logic anywhere in shipped code (DECISIONS D-014)', () => {
    const offenders = shippedFiles.filter((f) => /\b(hourly ?rate|wages?|pay ?rate|salary)\b/i.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the app writes to localStorage only the server-address override and the offline shift queue', () => {
    const writers = appFiles.filter((f) => /localStorage\??\.setItem\(/.test(read(f))).map(rel);
    expect(writers).toEqual(['src/config.ts']);
    // The queue writes through an injected storage object, never through a direct localStorage call.
    expect(read(join(ROOT, 'src/offline/shiftQueue.ts'))).toContain("export const QUEUE_KEY = 'wsv_shift_queue';");
    const calls = read(join(ROOT, 'src/config.ts')).match(/localStorage\??\.setItem\([^,]+,/g);
    expect(calls).toEqual(['localStorage?.setItem(API_URL_OVERRIDE_KEY,']);
  });

  it('no console.log/info/debug in the app (they could leak request data)', () => {
    const offenders = appFiles.filter((f) => /console\.(log|info|debug)\(/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });
});
