import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { FakeSheet } from '../../mock-backend/fakeGoogle';
import { MONTH_HEADER_ROWS, seedWorld, SeededWorld } from '../../mock-backend/seed';

let backend: Backend;
let world: SeededWorld;

const save = (extra: Record<string, unknown> = {}) =>
  backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20', ...extra });

const sheet = (name: string): FakeSheet => backend.google.spreadsheet.getSheetByName(name) as FakeSheet;
const columnsAtoI = (s: FakeSheet) => {
  const rows = s.dump().map((r) => r.slice(0, 9));
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return JSON.stringify(rows);
};

/** A month tab as v1 left it: In/Out stored as time values (not text), no minute columns. */
function legacyMonth(name: string): FakeSheet {
  const s = backend.google.spreadsheet.insertSheet(name);
  MONTH_HEADER_ROWS.forEach((row) => s.appendRow(row));
  s.getRange(3, 1, 1, 9).setValues([['09/01/2026', 'Alex Demo', '09:00', '15:20', 6.33, 'Sam Demo', '16:00', '23:00', 7]]);
  return s;
}

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
});

describe('In/Out stored as plain text', () => {
  it('writes "HH:mm" strings with the @ format, not time values', () => {
    save();
    const s = sheet('10-2026');
    expect(s.raw(10, 3)).toBe('09:00');
    expect(s.raw(10, 4)).toBe('15:20');
    expect(s.formatAt(10, 3)).toBe('@');
    expect(s.formatAt(10, 4)).toBe('@');
  });

  it('still reads v1 rows whose times are Date values (spreadsheet time zone)', () => {
    legacyMonth('09-2026');
    expect(sheet('09-2026').raw(3, 3)).toBeInstanceOf(Date);
    const res = backend.post({ action: 'getTimesheet', token: world.managerToken, monthYear: '09-2026' });
    expect((res.data as { records: unknown[] }).records).toEqual([
      { date: '2026-09-01', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' },
      { date: '2026-09-01', shift: 'Evening', name: 'Sam Demo', inTime: '16:00', outTime: '23:00' },
    ]);
  });
});

describe('minute columns and totals', () => {
  it('uses integer-minute, past-midnight-safe formulas with no decimal hours', () => {
    const blocks = backend.run<Array<{ row: number; col: number; formulas?: string[][]; values?: string[][] }>>('monthFormulaBlocks');
    const minutes = blocks.find((b) => b.row === 3 && b.col === 10)!.formulas!;
    expect(minutes).toHaveLength(31);
    expect(minutes[0][0]).toBe('=IF(OR(C3="",D3=""),"",IFERROR(MOD(ROUND((TIMEVALUE(TEXT(D3,"HH:mm"))-TIMEVALUE(TEXT(C3,"HH:mm")))*1440),1440),"CHECK"))');
    expect(minutes[30][1]).toBe('=IF(OR(G33="",H33=""),"",IFERROR(MOD(ROUND((TIMEVALUE(TEXT(H33,"HH:mm"))-TIMEVALUE(TEXT(G33,"HH:mm")))*1440),1440),"CHECK"))');

    const totals = blocks.find((b) => b.row === 1 && b.col === 14)!.formulas![0];
    expect(totals).toEqual([
      '=SUM(J3:J17)+SUM(K3:K17)',
      '=SUM(J18:J33)+SUM(K18:K33)',
      '=N1+O1',
      '=INT(P1/60)&":"&TEXT(MOD(P1,60),"00")',
    ]);
    const perEmployee = blocks.find((b) => b.row === 3 && b.col === 13)!.formulas![0];
    expect(perEmployee[1]).toBe('=ARRAYFORMULA(IF(M3:M33="","",SUMIF(B3:B17,M3:M33,J3:J17)+SUMIF(F3:F17,M3:M33,K3:K17)))');
    expect(perEmployee[2]).toBe('=ARRAYFORMULA(IF(M3:M33="","",SUMIF(B18:B33,M3:M33,J18:J33)+SUMIF(F18:F33,M3:M33,K18:K33)))');

    // No decimal hours: every "/60" is the whole-hours part of an h:mm label, nothing multiplies by
    // 24, and nothing rounds to decimal places.
    const all = JSON.stringify(blocks);
    const divisions = all.match(/\/60/g) ?? [];
    const hmmParts = all.match(/INT\([A-Z]\d+(:[A-Z]\d+)?\/60\)/g) ?? [];
    expect(divisions.length).toBe(hmmParts.length);
    expect(all).not.toContain('*24');
    expect(all).not.toMatch(/ROUND\([^)]*,\s*[1-9]\)/);
  });

  it('a new month tab gets the minute columns and totals on its first write', () => {
    save();
    const s = sheet('10-2026');
    expect(s.raw(2, 10)).toBe('Morning Min');
    expect(s.raw(2, 11)).toBe('Evening Min');
    expect(s.formulaAt(3, 10)).toContain('TIMEVALUE(TEXT(D3');
    expect(s.formulaAt(33, 11)).toContain('TIMEVALUE(TEXT(H33');
    expect(s.raw(1, 13)).toBe('All staff');
    expect(s.dump()[1].slice(12, 17)).toEqual(['Employee', '1-15 min', '16-end min', 'Month min', 'Month h:mm']);
    expect(s.formulaAt(3, 13)).toContain('UNIQUE');
  });
});

describe('migrateSheets (owner-run)', () => {
  it('adds the columns to Template and month tabs without touching A-I, and is idempotent', () => {
    const sept = legacyMonth('09-2026');
    const beforeSept = columnsAtoI(sept);
    const beforeTemplate = columnsAtoI(sheet('Template'));

    const first = backend.run<string[]>('migrateSheets');
    expect(first).toEqual(['Template: added, In/Out set to plain text', '09-2026: added', 'Employees: present']);
    expect(columnsAtoI(sept)).toBe(beforeSept);
    expect(columnsAtoI(sheet('Template'))).toBe(beforeTemplate);
    expect(sept.formulaAt(3, 10)).toContain('TIMEVALUE');
    expect(sheet('Template').formatAt(3, 3)).toBe('@');
    expect(sheet('Template').formatAt(33, 8)).toBe('@');

    expect(backend.run<string[]>('migrateSheets')).toEqual(['Template: present, In/Out set to plain text', '09-2026: present', 'Employees: present']);
    expect(JSON.stringify(sheet('Audit').dump())).toContain('setup.migrateSheets');
  });

  it('skips a tab whose target cells already hold the owner\'s data, writing nothing there', () => {
    const sept = legacyMonth('09-2026');
    sept.getRange(2, 10).setValue('Notes');
    const aug = legacyMonth('08-2026');
    aug.getRange(5, 14).setValue('owner total');
    const report = backend.run<string[]>('migrateSheets');
    expect(report).toContain('09-2026: skipped: J2 already holds something else');
    expect(report).toContain('08-2026: skipped: N5 already holds something else');
    expect(sept.formulaAt(3, 10)).toBe('');
    expect(aug.formulaAt(3, 10)).toBe('');
    expect(sept.raw(2, 10)).toBe('Notes');
  });

  it('leaves non-month tabs alone and the app reads the same records afterwards', () => {
    save();
    const read = () => backend.post({ action: 'getTimesheet', token: world.managerToken, monthYear: '10-2026' }).data;
    const before = JSON.stringify(read());
    const employees = JSON.stringify(sheet('Employees').dump());
    const timetable = JSON.stringify(sheet('Timetable').dump());
    backend.run('migrateSheets');
    expect(JSON.stringify(read())).toBe(before);
    expect(JSON.stringify(sheet('Employees').dump())).toBe(employees);
    expect(JSON.stringify(sheet('Timetable').dump())).toBe(timetable);
  });

  it('leaves Template In/Out formats alone when the Template has times in it', () => {
    sheet('Template').getRange(3, 3).setValue('09:00');
    const report = backend.run<string[]>('migrateSheets');
    expect(report[0]).toBe('Template: added, In/Out format left alone (cells not empty)');
    expect(sheet('Template').formatAt(4, 3)).toBe('');
  });
});
