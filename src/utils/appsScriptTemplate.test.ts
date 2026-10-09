import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPS_SCRIPT_CODE_GS } from './appsScriptTemplate';

describe('Settings backend export', () => {
  it('is byte-for-byte the backend in apps-script/Code.gs', () => {
    const onDisk = readFileSync(resolve(__dirname, '../../apps-script/Code.gs'), 'utf8');
    expect(APPS_SCRIPT_CODE_GS).toBe(onDisk);
  });
});
