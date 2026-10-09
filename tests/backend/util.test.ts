// Unit tests for the backend's pure helpers (apps-script/src/01_util.js), run inside the real bundle.
import { describe, expect, it } from 'vitest';
import { createBackend } from '../../mock-backend/loadBackend';

const backend = createBackend();
const run = <T,>(fn: string, ...args: unknown[]) => backend.run<T>(fn, ...args);

describe('normalizeTime', () => {
  it.each([
    ['9:00', '09:00'], ['09:00', '09:00'], ['23:59', '23:59'], ['00:00', '00:00'],
    ['16:00:00', '16:00'], ['4:30 PM', '16:30'], ['4:30 pm', '16:30'], ['12:05 AM', '00:05'], ['12:00 PM', '12:00'],
    ['24:00', ''], ['12:60', ''], ['13:00 PM', ''], ['0:30 AM', ''], ['9am', ''], ['', ''], [null, ''], [undefined, ''], ['  09:15  ', '09:15'],
  ])('%s -> %s', (input, expected) => {
    expect(run<string>('normalizeTime', input)).toBe(expected);
  });
});

describe('dates and months', () => {
  it('parseDateStr accepts only real calendar dates', () => {
    expect(run('parseDateStr', '2026-10-09')).toEqual({ year: 2026, month: 10, day: 9, monthYear: '10-2026' });
    expect(run('parseDateStr', '2028-02-29')).toMatchObject({ day: 29 });
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '10/09/2026', '2026-1-9', '', null]) {
      expect(run('parseDateStr', bad), String(bad)).toBeNull();
    }
  });

  it('isValidMonthYear', () => {
    expect(run('isValidMonthYear', '01-2026')).toBe(true);
    expect(run('isValidMonthYear', '12-2026')).toBe(true);
    for (const bad of ['13-2026', '00-2026', '1-2026', '2026-10', 'Template', '']) expect(run('isValidMonthYear', bad), bad).toBe(false);
  });
});

describe('PINs', () => {
  it('isSixDigitPin', () => {
    expect(run('isSixDigitPin', '402917')).toBe(true);
    for (const bad of ['40291', '4029170', '40291a', ' 402917', '']) expect(run('isSixDigitPin', bad), bad).toBe(false);
  });

  it('isWeakPin flags repeated digits and straight runs only', () => {
    for (const weak of ['000000', '999999', '123456', '234567', '654321', '987654', '012345']) expect(run('isWeakPin', weak), weak).toBe(true);
    for (const ok of ['402917', '112233', '121212', '135790', '123457']) expect(run('isWeakPin', ok), ok).toBe(false);
  });
});

describe('text safety', () => {
  it('safeCellText neutralises formula-looking text', () => {
    expect(run('safeCellText', '=IMPORTXML("x")')).toBe("'=IMPORTXML(\"x\")");
    expect(run('safeCellText', '+1')).toBe("'+1");
    expect(run('safeCellText', '-5')).toBe("'-5");
    expect(run('safeCellText', '@x')).toBe("'@x");
    expect(run('safeCellText', 'Alex Demo')).toBe('Alex Demo');
    expect(run('safeCellText', null)).toBe('');
  });

  it('a name that looks like a formula is stored as text, not run', () => {
    const b = createBackend();
    const audit = b.google.spreadsheet.insertSheet('Audit');
    b.run('audit', '=HYPERLINK("http://evil")', 'login.failed', '=1+1', '+2');
    expect(audit.dump()[0].slice(1)).toEqual(['=HYPERLINK("http://evil")', 'login.failed', '=1+1', '+2']);
    expect(audit.formulas.size).toBe(0);
  });

  it('constantTimeEquals', () => {
    expect(run('constantTimeEquals', 'abc', 'abc')).toBe(true);
    expect(run('constantTimeEquals', 'abc', 'abd')).toBe(false);
    expect(run('constantTimeEquals', 'abc', 'abcd')).toBe(false);
    expect(run('constantTimeEquals', '', '')).toBe(true);
  });

  it('bytesToHex handles Apps Script signed bytes', () => {
    expect(run('bytesToHex', [0, 15, 16, 127, -128, -1])).toBe('000f107f80ff');
  });

  it('parseActive: blank and yes-like values are active', () => {
    for (const active of ['', null, true, 'TRUE', 'yes', 'Y', 'active']) expect(run('parseActive', active), String(active)).toBe(true);
    for (const inactive of [false, 'FALSE', 'no', 'N', '0', 'inactive', ' Inactive ']) expect(run('parseActive', inactive), String(inactive)).toBe(false);
  });
});
