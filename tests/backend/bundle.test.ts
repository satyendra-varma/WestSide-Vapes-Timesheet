import { describe, expect, it } from 'vitest';
import { bundleAppsScript, readBundle } from '../../scripts/build-apps-script';

describe('apps-script/Code.gs', () => {
  it('is exactly the concatenation of apps-script/src/*.js (run `npm run build:gas` if this fails)', () => {
    expect(readBundle()).toBe(bundleAppsScript());
  });

  it('contains no hardcoded PIN or secret assignments', () => {
    const code = readBundle();
    expect(code).not.toMatch(/PIN\s*[:=]\s*['"]\d{4,}['"]/);
    expect(code).not.toMatch(/(SECRET|PEPPER)\s*[:=]\s*['"][0-9a-f]{16,}['"]/i);
  });
});
